import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {loadCatalog} from '../../src/utils/catalog.js'
import {setConfigDir} from '../../src/utils/config.js'
import {prompts, terminal} from '../../src/utils/prompts.js'
import {readTrust, runnableParts, writeTrust} from '../../src/utils/trust.js'
import {ensureTrusted, formatTrustChanges} from '../../src/utils/trust-gate.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

const source = (command: string, description = 'Prepare.') => `version: 1
entries:
  release:artifact:prepare:
    description: ${description}
    commands:
      - ${command}
  lint:
    description: Lint.
    commands:
      - pnpm lint
`

describe('trust gate', () => {
    let tmp: string
    let cleanup: (() => void) | undefined
    let originalSelect: typeof prompts.select
    let originalInteractive: typeof terminal.isInteractive
    let answers: string[]
    let asked: number
    let logs: string[]
    const log = (m: string) => logs.push(m)

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xcute-gate-'))
        setConfigDir(tmp)
        originalSelect = prompts.select
        originalInteractive = terminal.isInteractive
        answers = []
        asked = 0
        logs = []
        terminal.isInteractive = () => true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prompts.select = (async () => {
            asked++
            return answers.shift()
        }) as any
    })

    afterEach(() => {
        prompts.select = originalSelect
        terminal.isInteractive = originalInteractive
        cleanup?.()
        cleanup = undefined
        fs.rmSync(tmp, {force: true, recursive: true})
    })

    function repo(text: string) {
        const r = createCatalogRepo(text)
        cleanup = r.cleanup
        return loadCatalog()!
    }

    it('passes without prompting when the record matches', async () => {
        const loaded = repo(source('pnpm a'))
        writeTrust(loaded.file, runnableParts(loaded.catalog!))
        expect(await ensureTrusted(loaded, log)).to.equal(true)
        expect(asked).to.equal(0)
    })

    it('refuses without a TTY and names xcute trust', async () => {
        const loaded = repo(source('pnpm a'))
        terminal.isInteractive = () => false
        expect(await ensureTrusted(loaded, log)).to.equal(false)
        expect(logs.join('\n')).to.contain('xcute trust')
        expect(asked).to.equal(0)
    })

    it('asks on first use and records trust', async () => {
        const loaded = repo(source('pnpm a'))
        answers = ['trust']
        expect(await ensureTrusted(loaded, log)).to.equal(true)
        expect(readTrust(loaded.file)).to.not.equal(undefined)
        expect(logs.join('\n')).to.contain('2 entries, 2 commands')
    })

    it('shows all commands then asks again', async () => {
        const loaded = repo(source('pnpm a'))
        answers = ['show', 'trust']
        expect(await ensureTrusted(loaded, log)).to.equal(true)
        expect(asked).to.equal(2)
        expect(logs.join('\n')).to.contain('pnpm a').and.contain('pnpm lint')
    })

    it('shows only the change after a command edit', async () => {
        const first = repo(source('pnpm release:artifact:prepare'))
        writeTrust(first.file, runnableParts(first.catalog!))
        fs.writeFileSync(first.file, source('pnpm release:artifact:prepare --sign'))
        answers = ['trust']
        expect(await ensureTrusted(loadCatalog()!, log)).to.equal(true)
        const out = logs.join('\n')
        expect(out).to.contain('+   pnpm release:artifact:prepare --sign')
        expect(out).to.contain('-   pnpm release:artifact:prepare\n')
        expect(out).to.not.contain('pnpm lint')
    })

    it('does not prompt after a description-only edit', async () => {
        const first = repo(source('pnpm a'))
        writeTrust(first.file, runnableParts(first.catalog!))
        fs.writeFileSync(first.file, source('pnpm a', 'Something else.'))
        expect(await ensureTrusted(loadCatalog()!, log)).to.equal(true)
        expect(asked).to.equal(0)
    })

    it('returns false on Cancel and records nothing', async () => {
        const loaded = repo(source('pnpm a'))
        answers = ['cancel']
        expect(await ensureTrusted(loaded, log)).to.equal(false)
        expect(readTrust(loaded.file)).to.equal(undefined)
    })

    it('reuses trust when the repo is opened through a symlink', async () => {
        const loaded = repo(source('pnpm a'))
        writeTrust(loaded.file, runnableParts(loaded.catalog!))
        const link = path.join(tmp, 'link')
        fs.symlinkSync(loaded.dir, link)
        process.chdir(link)
        expect(await ensureTrusted(loadCatalog()!, log)).to.equal(true)
        expect(asked).to.equal(0)
    })

    it('renders a visible line when only the entry type changed', () => {
        const lines = formatTrustChanges([{added: [], label: 'deploy', removed: [], reordered: false}])
        expect(lines).to.deep.equal(['  deploy', '    (entry type changed)'])
    })

    it('renders added, removed and reordered changes', () => {
        const lines = formatTrustChanges([
            {added: ['b'], label: 'x', removed: ['a'], reordered: false},
            {added: [], label: 'y', removed: [], reordered: true},
        ])
        expect(lines).to.deep.equal(['  x', '-   a', '+   b', '  y', '    (order changed)'])
    })
})
