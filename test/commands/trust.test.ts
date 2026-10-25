import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {setConfigDir} from '../../src/utils/config.js'
import {loadCatalog} from '../../src/utils/catalog.js'
import {readTrust} from '../../src/utils/trust.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

const source = `version: 1
entries:
  lint:
    description: Lint.
    commands:
      - pnpm lint
`

describe('trust command', () => {
    let tmp: string
    let cleanup: (() => void) | undefined

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xcute-trustcmd-'))
        setConfigDir(tmp)
    })

    afterEach(() => {
        cleanup?.()
        cleanup = undefined
        fs.rmSync(tmp, {force: true, recursive: true})
    })

    function repo(text: string | undefined) {
        const r = createCatalogRepo(text)
        cleanup = r.cleanup
        return r
    }

    it('xcute trust records the catalog and reports its size', async () => {
        repo(source)
        const {stdout} = await runCommand(['trust'])
        expect(stdout).to.contain('Trusted').and.contain('1 entries, 1 commands')
        expect(readTrust(loadCatalog()!.file)).to.not.equal(undefined)
    })

    it('xcute trust reports an already trusted catalog', async () => {
        repo(source)
        await runCommand(['trust'])
        const {stdout} = await runCommand(['trust'])
        expect(stdout).to.contain('is already trusted.')
    })

    it('xcute trust prints the changes after an edit', async () => {
        const r = repo(source)
        await runCommand(['trust'])
        fs.writeFileSync(path.join(r.dir, 'xcute.yml'), source.replace('pnpm lint', 'pnpm lint --fix'))
        const {stdout} = await runCommand(['trust'])
        expect(stdout).to.contain('+   pnpm lint --fix').and.contain('Trusted')
    })

    it('xcute trust --revoke removes the record', async () => {
        repo(source)
        await runCommand(['trust'])
        const {stdout} = await runCommand(['trust', '--revoke'])
        expect(stdout).to.contain('Trust revoked for')
        expect(readTrust(loadCatalog()!.file)).to.equal(undefined)
        const again = await runCommand(['trust', '--revoke'])
        expect(again.stdout).to.contain('was not trusted.')
    })

    it('xcute trust exits 1 for an invalid catalog', async () => {
        repo('version: 1\nentries: nope\n')
        const {error} = await runCommand(['trust'])
        expect(error?.oclif?.exit).to.equal(1)
    })

    it('xcute trust outside a repo errors', async () => {
        repo(undefined)
        const {error} = await runCommand(['trust'])
        expect(error?.message).to.contain('No xcute.yml found from here.')
    })
})
