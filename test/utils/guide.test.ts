import {expect} from 'chai'

import {parseCatalog} from '../../src/utils/catalog-schema.js'
import type {GuideEntry} from '../../src/utils/catalog-schema.js'
import type {LoadedCatalog} from '../../src/utils/catalog.js'
import {fillPlaceholders, guideVariables, renderEntry, resumeHint, shellQuote} from '../../src/utils/guide.js'
import {prompts} from '../../src/utils/prompts.js'
import {extractVariables} from '../../src/utils/variables.js'

const SOURCE = `name: InertiaX
topics:
  lines:
    title: Lines
entries:
  rehearsal:
    topic: lines
    description: Prove the line machinery once.
    docs: .github/RELEASING.md#rehearsal-checklist
    steps:
      - title: Plan the branch point
        text: Run right after a release.
        run: pnpm line plan {{component::Component|table}} {{major::Major|0}} --rehearsal
      - title: Register the line on master
        run: pnpm line register {{component}}/{{major}}.x --rehearsal
      - title: Merge the registration
        manual: Commit, open a pull request into master, and merge it.
        warn: Do this before pushing the line branch.
      - title: Create the line branch
        run:
          - git switch -c {{component}}/{{major}}.x {{branch_point::The commit step 1 printed}}
          - pnpm line apply {{component}}/{{major}}.x --rehearsal
      - title: Check the Release PR
        check: changeset-release/{{component}}/{{major}}.x has the right base.
        warn: Do not merge it.
`

function load() {
    const {catalog, errors} = parseCatalog(SOURCE)
    expect(errors).to.deep.equal([])
    const entry = catalog!.entries[0] as GuideEntry
    const loaded: LoadedCatalog = {catalog, dir: '/tmp/x', errors: [], file: '/tmp/x/xcute.yml', name: 'x'}
    return {entry, loaded}
}

describe('guide text', () => {
    it('orders guide variables by first appearance across steps', () => {
        const {entry} = load()
        expect([...guideVariables(entry).keys()]).to.deep.equal(['component', 'major', 'branch_point'])
    })

    it('fills provided values, then defaults, then placeholders', () => {
        const variables = extractVariables(['{{component|table}} {{major|0}} {{branch_point}}'])
        expect(fillPlaceholders('{{component}}/{{major|0}}.x {{branch_point}}', variables, {component: 'table'}))
            .to.equal('table/0.x <branch_point>')
    })

    it('quotes values with spaces in the resume hint', () => {
        expect(resumeHint('rehearsal', ['table', 'a b'], 4))
            .to.equal("Stopped at step 4. Pick up with: xcute rehearsal table 'a b' --from 4")
        expect(shellQuote("it's")).to.equal(String.raw`'it'\''s'`)
    })

    describe('renderEntry', () => {
        let originalInput: typeof prompts.input
        let inputCalls = 0

        beforeEach(() => {
            originalInput = prompts.input
            inputCalls = 0
            prompts.input = (async () => { inputCalls++; return '' }) as typeof prompts.input
        })

        afterEach(() => {
            prompts.input = originalInput
        })

        it('renders every step of a guide without prompting', () => {
            const {entry, loaded} = load()
            const lines = renderEntry({catalog: loaded, entry, name: 'rehearsal', source: 'project'}, [])
            const text = lines.join('\n')
            expect(inputCalls).to.equal(0)
            expect(lines.slice(0, 4)).to.deep.equal([
                'rehearsal',
                'Prove the line machinery once.',
                'InertiaX · Lines',
                'docs .github/RELEASING.md#rehearsal-checklist',
            ])
            expect(text).to.contain('4. Create the line branch')
            expect(text).to.contain('$ git switch -c table/0.x <branch_point>')
            expect(text).to.contain('Pick up again: xcute rehearsal [values] --from <n>')
        })

        it('maps positional values onto the variables', () => {
            const {entry, loaded} = load()
            const text = renderEntry({catalog: loaded, entry, name: 'rehearsal', source: 'project'}, ['grid', '2', 'abc123']).join('\n')
            expect(text).to.contain('$ git switch -c grid/2.x abc123')
        })

        it('marks by-hand and check steps and shows warnings', () => {
            const {entry, loaded} = load()
            const text = renderEntry({catalog: loaded, entry, name: 'rehearsal', source: 'project'}, []).join('\n')
            expect(text).to.contain('3. Merge the registration  by hand')
            expect(text).to.contain('5. Check the Release PR  check')
            expect(text).to.contain('⚠ Do this before pushing the line branch.')
        })
    })
})
