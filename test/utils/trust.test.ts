import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {parseCatalog} from '../../src/utils/catalog-schema.js'
import {setConfigDir} from '../../src/utils/config.js'
import {
    canonicalCommand,
    countCommands,
    diffRunnable,
    getTrustFile,
    readTrust,
    revokeTrust,
    runnableParts,
    sameRunnable,
    writeTrust,
} from '../../src/utils/trust.js'
import {extractVariables} from '../../src/utils/variables.js'

function load(source: string) {
    const {catalog, errors} = parseCatalog(source)
    if (!catalog) throw new Error(JSON.stringify(errors))
    return catalog
}

function cmd(command: string, extra = '') {
    return `version: 1
entries:
  release:artifact:prepare:
    description: Prepare.${extra}
    commands:
      - ${command}
`
}

function guide(opts: {check?: string; manualFirst?: boolean; title?: string; warn?: string; command?: string} = {}) {
    const {check = 'git status', command = 'pnpm line plan {{component}} --dry', manualFirst = false, title = 'Create the line branch', warn} = opts
    return `version: 1
entries:
  rehearsal:
    description: Rehearse.
    steps:
${manualFirst ? '      - title: Read this\n        manual: Read the docs\n' : ''}      - title: ${title}
        text: some text
${warn ? `        warn: "${warn}"\n` : ''}        run:
          - ${command}
      - title: Look
        check: ${check}
`
}

describe('trust', () => {
    let dir: string

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcute-trust-'))
        setConfigDir(dir)
    })

    afterEach(() => {
        setConfigDir(undefined)
        fs.rmSync(dir, {force: true, recursive: true})
    })

    it('ignores descriptions, titles, text, manual and check changes', () => {
        const a = load(guide())
        const b = load(guide({check: 'git log', title: 'Other title'}).replace('Rehearse.', 'Changed.'))
        expect(sameRunnable(runnableParts(a), runnableParts(b))).to.equal(true)
    })

    it('does not change when a manual or check step is inserted', () => {
        expect(sameRunnable(runnableParts(load(guide())), runnableParts(load(guide({manualFirst: true}))))).to.equal(true)
    })

    it('changes when a command changes', () => {
        const before = runnableParts(load(cmd('pnpm release:artifact:prepare')))
        const afterCatalog = load(cmd('pnpm release:artifact:prepare --sign'))
        const changes = diffRunnable(before, runnableParts(afterCatalog), afterCatalog)
        expect(changes).to.deep.equal([{added: ['pnpm release:artifact:prepare --sign'], label: 'release:artifact:prepare', removed: ['pnpm release:artifact:prepare'], reordered: false}])
    })

    it('changes when a default is added only in a guide warn field', () => {
        const a = load(guide())
        const b = load(guide({warn: 'see {{component|evil}}'}))
        expect(sameRunnable(runnableParts(a), runnableParts(b))).to.equal(false)
        expect(runnableParts(b).rehearsal.commands).to.deep.equal([['pnpm line plan {{component|evil}} --dry']])
    })

    it('drops variable descriptions from the canonical form', () => {
        const command = 'gh run --pr={{pr::Pull request number}}'
        expect(canonicalCommand(command, extractVariables([command]))).to.equal('gh run --pr={{pr}}')
    })

    it('changes when a guide becomes a command entry with the same commands', () => {
        const guideCatalog = load(guide({command: 'echo hi'}))
        const cmdCatalog = load(`version: 1
entries:
  rehearsal:
    description: Rehearse.
    commands:
      - echo hi
`)
        const before = runnableParts(guideCatalog)
        const after = runnableParts(cmdCatalog)
        expect(sameRunnable(before, after)).to.equal(false)
        expect(diffRunnable(before, after, cmdCatalog)).to.have.length(1)
    })

    it('labels guide changes with the current run step title', () => {
        const before = runnableParts(load(guide()))
        const afterCatalog = load(guide({command: 'pnpm line plan {{component}} --real'}))
        const changes = diffRunnable(before, runnableParts(afterCatalog), afterCatalog)
        expect(changes.map((c) => c.label)).to.deep.equal(['rehearsal › Create the line branch'])
    })

    it('labels a removed run step by number', () => {
        const before = runnableParts(load(guide()))
        const afterCatalog = load(guide().replace(/ {8}run:\n {10}- .*\n/, '        manual: by hand\n'))
        const changes = diffRunnable(before, runnableParts(afterCatalog), afterCatalog)
        expect(changes.map((c) => c.label)).to.deep.equal(['rehearsal › run step 1'])
    })

    it('marks a pure reorder', () => {
        const a = load(`version: 1
entries:
  x:
    description: d
    commands:
      - one
      - two
`)
        const b = load(`version: 1
entries:
  x:
    description: d
    commands:
      - two
      - one
`)
        expect(diffRunnable(runnableParts(a), runnableParts(b), b)).to.deep.equal([{added: [], label: 'x', removed: [], reordered: true}])
    })

    it('reports added and removed entries and counts commands', () => {
        const a = load(cmd('one'))
        const empty = {entries: [], topics: []}
        expect(diffRunnable({}, runnableParts(a), a)).to.deep.equal([{added: ['one'], label: 'release:artifact:prepare', removed: [], reordered: false}])
        expect(diffRunnable(runnableParts(a), {}, empty)).to.deep.equal([{added: [], label: 'release:artifact:prepare', removed: ['one'], reordered: false}])
        expect(countCommands(runnableParts(a))).to.equal(1)
    })

    it('round-trips through trust.json and revokes', () => {
        const file = path.join(dir, 'xcute.yml')
        fs.writeFileSync(file, '')
        const parts = runnableParts(load(guide()))
        expect(readTrust(file)).to.equal(undefined)
        writeTrust(file, parts)
        expect(readTrust(file)).to.deep.equal(parts)
        const store = JSON.parse(fs.readFileSync(getTrustFile(), 'utf8'))
        expect(store[fs.realpathSync(file)].trustedAt).to.be.a('string')
        expect(revokeTrust(file)).to.equal(true)
        expect(readTrust(file)).to.equal(undefined)
        expect(revokeTrust(file)).to.equal(false)
    })

    it('treats a corrupt trust.json as untrusted', () => {
        const file = path.join(dir, 'xcute.yml')
        fs.writeFileSync(file, '')
        fs.writeFileSync(getTrustFile(), '{oops')
        expect(readTrust(file)).to.equal(undefined)
        writeTrust(file, {})
        expect(readTrust(file)).to.deep.equal({})
    })

    it('treats a record without runnable as untrusted', () => {
        const file = path.join(dir, 'xcute.yml')
        fs.writeFileSync(file, '')
        fs.writeFileSync(getTrustFile(), JSON.stringify({[fs.realpathSync(file)]: {trustedAt: 'x'}}))
        expect(readTrust(file)).to.equal(undefined)
    })

    it('detects an added __proto__ entry, in memory and after a trust.json round trip', () => {
        const base = load(cmd('one'))
        const evil = {
            ...base,
            entries: [...base.entries, {commands: ['rm -rf ~'], description: 'x', kind: 'commands' as const, name: '__proto__'}],
        }
        const before = runnableParts(base)
        const after = runnableParts(evil)
        expect(sameRunnable(before, after)).to.equal(false)
        expect(countCommands(after)).to.equal(2)
        expect(diffRunnable(before, after, evil).map((c) => c.label)).to.deep.equal(['__proto__'])

        const file = path.join(dir, 'xcute.yml')
        fs.writeFileSync(file, '')
        writeTrust(file, after)
        const stored = readTrust(file)!
        expect(sameRunnable(stored, after)).to.equal(true)
        expect(sameRunnable(stored, before)).to.equal(false)
    })

    it('rejects __proto__ as an entry name', () => {
        const {errors} = parseCatalog('version: 1\nentries:\n  __proto__:\n    description: d\n    commands:\n      - x\n')
        expect(errors).to.deep.equal([{line: 3, message: 'entry "__proto__": this name is reserved'}])
    })

    it('handles entries named like Object.prototype members', () => {
        const a = load(`version: 1
entries:
  constructor:
    description: d
    commands:
      - one
`)
        const empty = {entries: [], topics: []}
        expect(diffRunnable({}, runnableParts(a), a).map((c) => c.label)).to.deep.equal(['constructor'])
        expect(diffRunnable(runnableParts(a), {}, empty).map((c) => c.label)).to.deep.equal(['constructor'])
    })

    it('treats a duplicated command as an addition, not a reorder', () => {
        const a = load(cmd('one'))
        const b = load(`version: 1
entries:
  release:artifact:prepare:
    description: d
    commands:
      - one
      - one
`)
        expect(diffRunnable(runnableParts(a), runnableParts(b), b)).to.deep.equal([{added: ['one'], label: 'release:artifact:prepare', removed: [], reordered: false}])
    })
})
