import {expect} from 'chai'

import {formatCatalogError, type GuideEntry, parseCatalog} from '../../src/utils/catalog-schema.js'

const VALID = `version: 1
name: Demo

topics:
  lines:
    title: Lines
    summary: create, rehearse, backport, end a line
  sites:
    title: Sites & docs
    summary: build, dev servers, verify, previews

entries:
  rerun-site-previews:
    topic: sites
    description: A preview workflow failed and "Re-run failed jobs" is refused.
    docs: .github/RELEASING.md#internal-snapshots-and-pr-previews
    commands:
      - gh workflow run site-previews.yml --ref master -f pr_number={{pr::Pull request number}}

  rehearsal:
    topic: lines
    description: Prove the line machinery once, before 1.0, with a throwaway line.
    docs: .github/RELEASING.md#rehearsal-checklist
    steps:
      - title: Plan the branch point
        text: Run right after a release, on a clean master. Prints master's HEAD.
        run: pnpm line plan {{component::Component|table}} {{major::Major|0}} --rehearsal
      - title: Register the line on master
        run: pnpm line register {{component}}/{{major}}.x --rehearsal
      - title: Merge the registration
        manual: Commit, open a pull request into master, and merge it.
        warn: Do this before pushing the line branch. Its workflows accept it only once master declares it.
      - title: Create the line branch
        run:
          - git switch -c {{component}}/{{major}}.x {{branch_point::The commit step 1 printed}}
          - pnpm line apply {{component}}/{{major}}.x --rehearsal
      - title: Check the Release PR
        check: changeset-release/{{component}}/{{major}}.x into {{component}}/{{major}}.x has the right versions, changelog and base branch.
        warn: Do not merge it. Merging creates real tags that master's next releases need.
`

const msgs = (source: string) => parseCatalog(source).errors

describe('catalog schema', () => {
    it('parses topics, command entries and guides in file order', () => {
        const {catalog, errors} = parseCatalog(VALID)
        expect(errors).to.deep.equal([])
        expect(catalog!.name).to.equal('Demo')
        expect(catalog!.topics.map((t) => t.id)).to.deep.equal(['lines', 'sites'])
        expect(catalog!.entries.map((e) => e.name)).to.deep.equal(['rerun-site-previews', 'rehearsal'])
        const guide = catalog!.entries[1] as GuideEntry
        expect(guide.steps.map((s) => s.kind)).to.deep.equal(['run', 'run', 'manual', 'run', 'check'])
        expect(guide.steps[0].run).to.have.length(1)
        expect(guide.steps[3].run).to.have.length(2)
    })

    it('keeps numeric-looking entry names in order', () => {
        const {catalog, errors} = parseCatalog('entries:\n  b:\n    description: d\n    commands: [x]\n  "1":\n    description: d\n    commands: [x]\n')
        expect(errors).to.deep.equal([])
        expect(catalog!.entries.map((e) => e.name)).to.deep.equal(['b', '1'])
    })

    it('reports YAML syntax errors with a line number', () => {
        const errors = msgs('entries:\n  a:\n    description: d\n\tcommands: [x]\n')
        expect(errors[0].line).to.equal(4)
    })

    it('rejects unknown keys and names the line', () => {
        const errors = msgs('entries:\n  a:\n    description: d\n    comands:\n      - x\n')
        expect(errors.map((e) => e.message)).to.include('entry "a": unknown key "comands"')
        expect(errors.find((e) => e.message.includes('comands'))!.line).to.equal(4)
    })

    it('requires a description on every entry', () => {
        const errors = msgs('entries:\n  x:\n    commands: [a]\n')
        expect(errors).to.deep.equal([{line: 2, message: 'entry "x": description is required'}])
    })

    it('rejects an entry with both commands and steps', () => {
        const errors = msgs('entries:\n  x:\n    description: d\n    commands: [a]\n    steps:\n      - title: t\n        run: a\n')
        expect(errors.map((e) => e.message)).to.deep.equal(['entry "x": use either commands or steps'])
    })

    it('rejects an entry with neither commands nor steps', () => {
        const errors = msgs('entries:\n  x:\n    description: d\n')
        expect(errors.map((e) => e.message)).to.deep.equal(['entry "x": use either commands or steps'])
    })

    it('rejects an undeclared topic', () => {
        const errors = msgs('entries:\n  x:\n    topic: nope\n    description: d\n    commands: [a]\n')
        expect(errors).to.deep.equal([{line: 3, message: 'entry "x": topic "nope" is not declared'}])
    })

    it('rejects a version other than 1', () => {
        const errors = msgs('version: 2\nentries:\n  x:\n    description: d\n    commands: [a]\n')
        expect(errors).to.deep.equal([{line: 1, message: 'version must be 1'}])
    })

    it('rejects a step with zero or two of run/manual/check', () => {
        const zero = msgs('entries:\n  g:\n    description: d\n    steps:\n      - title: a\n        run: x\n      - title: b\n')
        expect(zero.map((e) => e.message)).to.deep.equal(['entry "g", step 2: use exactly one of run, manual or check'])
        const two = msgs('entries:\n  g:\n    description: d\n    steps:\n      - title: a\n        run: x\n        manual: y\n')
        expect(two.map((e) => e.message)).to.deep.equal(['entry "g", step 1: use exactly one of run, manual or check'])
    })

    it('requires a step title', () => {
        const errors = msgs('entries:\n  g:\n    description: d\n    steps:\n      - run: x\n')
        expect(errors.map((e) => e.message)).to.deep.equal(['entry "g", step 1: title is required'])
    })

    it('rejects empty commands, steps and run lists', () => {
        expect(msgs('entries:\n  x:\n    description: d\n    commands: []\n')[0].message).to.equal('entry "x": commands must not be empty')
        expect(msgs('entries:\n  x:\n    description: d\n    steps: []\n')[0].message).to.equal('entry "x": steps must not be empty')
        expect(msgs('entries:\n  x:\n    description: d\n    steps:\n      - title: t\n        run: []\n')[0].message).to.equal('entry "x", step 1: run must not be empty')
    })

    it('reports an empty or comments-only file as missing entries', () => {
        for (const source of ['', '# nothing here\n']) {
            const errors = msgs(source)
            expect(errors).to.have.length(1)
            expect(errors[0].message).to.include('entries is required')
        }
    })

    it('hints at quoting when a value starting with {{ parsed as a mapping', () => {
        const errors = msgs('entries:\n  x:\n    description: d\n    steps:\n      - title: t\n        run: {{cmd}}\n')
        expect(errors.length).to.be.greaterThan(0)
        expect(errors.map((e) => e.message).join('\n')).to.include('must be quoted')
    })

    it('formats errors as file:line: message', () => {
        expect(formatCatalogError('/r/xcute.yml', {line: 4, message: 'boom'})).to.equal('/r/xcute.yml:4: boom')
        expect(formatCatalogError('/r/xcute.yml', {message: 'boom'})).to.equal('/r/xcute.yml: boom')
    })
})
