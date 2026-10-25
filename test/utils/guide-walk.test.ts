import {expect} from 'chai'
import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type GuideEntry, type GuideStep, parseCatalog} from '../../src/utils/catalog-schema.js'
import {stepVariables, walkGuide, type WalkOptions} from '../../src/utils/guide.js'
import {prompts} from '../../src/utils/prompts.js'

const SOURCE = `entries:
  rehearsal:
    description: Prove the line machinery once.
    steps:
      - title: Plan {{component::Component}} {{major::Major}}
        run: node -e "require('fs').writeFileSync('m1-{{component}}-{{major}}','')"
      - title: Register
        run: node -e "require('fs').writeFileSync('m2','')"
      - title: Merge it
        manual: Merge the pull request.
      - title: Create the branch
        run: node -e "require('fs').writeFileSync('m4-{{branch_point::Commit}}','')"
      - title: Check the PR
        check: Right base for {{component}}.
        warn: Do not merge it.
`

function guide(source = SOURCE): GuideEntry {
    const {catalog, errors} = parseCatalog(source)
    expect(errors).to.deep.equal([])
    return catalog!.entries[0] as GuideEntry
}

describe('walkGuide', () => {
    const originalSelect = prompts.select
    const originalInput = prompts.input
    let dir: string
    let out: string[]
    let errs: string[]
    let selectAnswers: string[]
    let selectChoices: string[][]
    let inputAnswers: string[]
    let inputMessages: string[]

    const opts = (extra: Partial<WalkOptions> = {}): WalkOptions => ({
        cwd: dir, log: (m) => out.push(m), logError: (m) => errs.push(m), name: 'rehearsal', providedValues: [], ...extra,
    })
    const marker = (file: string) => existsSync(join(dir, file))

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'xcute-walk-'))
        out = []
        errs = []
        selectAnswers = []
        selectChoices = []
        inputAnswers = []
        inputMessages = []
        prompts.select = (async (config: {choices: Array<{name: string}>}) => {
            selectChoices.push(config.choices.map((c) => c.name))
            const answer = selectAnswers.shift()
            if (answer === 'CTRL_C') throw Object.assign(new Error('x'), {name: 'ExitPromptError'})
            return answer
        }) as unknown as typeof prompts.select
        prompts.input = (async (config: {message: string}) => {
            inputMessages.push(config.message)
            return inputAnswers.shift() ?? ''
        }) as unknown as typeof prompts.input
    })

    afterEach(() => {
        prompts.select = originalSelect
        prompts.input = originalInput
        rmSync(dir, {force: true, recursive: true})
    })

    it('lists the variables a step uses in field order', () => {
        const step: GuideStep = {kind: 'run', run: ['a {{c}}'], text: '{{b}}', title: '{{a}} {{b}}', warn: '{{d}}'}
        expect(stepVariables(step)).to.deep.equal(['a', 'b', 'd', 'c'])
    })

    it('asks each value the first time a step needs it', async () => {
        inputAnswers = ['table', '0', 'abc']
        selectAnswers = ['run', 'run', 'continue', 'run', 'continue']
        const code = await walkGuide(guide(), opts())
        expect(code).to.equal(0)
        expect(inputMessages.map((m) => m.split(':')[0])).to.deep.equal(['component', 'major', 'branch_point'])
        expect(marker('m4-abc')).to.equal(true)
        expect(out.at(-1)).to.equal('Guide done.')
    })

    it('does not ask for branch_point before step 4', async () => {
        inputAnswers = ['table', '0']
        selectAnswers = ['run', 'stop']
        await walkGuide(guide(), opts())
        expect(inputMessages).to.have.length(2)
    })

    it('uses positional values in guide variable order without prompting', async () => {
        selectAnswers = ['run', 'skip', 'continue', 'run', 'continue']
        await walkGuide(guide(), opts({providedValues: ['grid', '2', 'xyz']}))
        expect(inputMessages).to.deep.equal([])
        expect(marker('m1-grid-2')).to.equal(true)
        expect(marker('m4-xyz')).to.equal(true)
    })

    it('runs, skips and stops as chosen', async () => {
        selectAnswers = ['run', 'skip', 'continue', 'stop']
        const code = await walkGuide(guide(), opts({providedValues: ['t', '0', 'z']}))
        expect(code).to.equal(0)
        expect(marker('m1-t-0')).to.equal(true)
        expect(marker('m2')).to.equal(false)
        expect(marker('m4-z')).to.equal(false)
        expect(out.at(-1)).to.equal('Stopped at step 4. Pick up with: xcute rehearsal t 0 z --from 4')
        expect(selectChoices[0]).to.deep.equal(['Run', 'Skip', 'Stop'])
    })

    it('keeps passed values for steps not reached yet in the stop hint', async () => {
        selectAnswers = ['run', 'stop']
        expect(await walkGuide(guide(), opts({providedValues: ['t', '0', 'z']}))).to.equal(0)
        expect(out.at(-1)).to.equal('Stopped at step 2. Pick up with: xcute rehearsal t 0 z --from 2')
    })

    it('keeps passed values for steps skipped by --from in the stop hint', async () => {
        selectAnswers = ['stop']
        expect(await walkGuide(guide(), opts({from: 4, providedValues: ['table', '0', 'abc']}))).to.equal(0)
        expect(out.at(-1)).to.equal('Stopped at step 4. Pick up with: xcute rehearsal table 0 abc --from 4')
    })

    it('waits at manual and check steps', async () => {
        selectAnswers = ['skip', 'skip', 'continue', 'skip', 'continue']
        const code = await walkGuide(guide(), opts({providedValues: ['t', '0', 'z']}))
        expect(code).to.equal(0)
        expect(selectChoices[2]).to.deep.equal(['Done, continue', 'Stop here'])
        expect(selectChoices[4]).to.deep.equal(['Looks right, continue', "Something's wrong, stop"])
        expect(out).to.include('⚠ Do not merge it.')
        expect(out).to.include('── 3/5  Merge it [by hand]')
    })

    it('stops at a manual step with exit 0', async () => {
        selectAnswers = ['skip', 'skip', 'stop']
        expect(await walkGuide(guide(), opts({providedValues: ['t', '0']}))).to.equal(0)
        expect(out.at(-1)).to.equal('Stopped at step 3. Pick up with: xcute rehearsal t 0 --from 3')
    })

    it('stops with exit 1 and a hint on "Something\'s wrong"', async () => {
        selectAnswers = ['skip', 'skip', 'continue', 'skip', 'stop']
        const code = await walkGuide(guide(), opts({providedValues: ['t', '0', 'z']}))
        expect(code).to.equal(1)
        expect(out.at(-1)).to.equal('Stopped at step 5. Pick up with: xcute rehearsal t 0 z --from 5')
    })

    it('offers Retry after a failing command and exits 1 on Stop', async () => {
        const failing = guide(`entries:
  g:
    description: d
    steps:
      - title: Fails
        run: node -e "process.exit(3)"
`)
        selectAnswers = ['run', 'retry', 'stop']
        const code = await walkGuide(failing, opts({name: 'g'}))
        expect(code).to.equal(1)
        expect(selectChoices[1]).to.deep.equal(['Retry', 'Skip', 'Stop'])
        expect(errs).to.deep.equal(['Command failed with exit code 3', 'Command failed with exit code 3'])
        expect(out.at(-1)).to.equal('Stopped at step 1. Pick up with: xcute g --from 1')
    })

    it('continues after Skip on a failing command', async () => {
        const failing = guide(`entries:
  g:
    description: d
    steps:
      - title: Fails
        run: node -e "process.exit(3)"
`)
        selectAnswers = ['run', 'skip']
        expect(await walkGuide(failing, opts({name: 'g'}))).to.equal(0)
    })

    it('starts at --from and does not ask values only earlier steps use', async () => {
        selectAnswers = ['run', 'continue']
        // component is used by step 5 too, so it is asked; major only by step 1, so it is not
        inputAnswers = ['table', 'abc']
        await walkGuide(guide(), opts({from: 4}))
        expect(inputMessages.map((m) => m.split(':')[0])).to.deep.equal(['branch_point', 'component'])
        expect(marker('m1-table-0')).to.equal(false)
    })

    it('rejects --from 0, 99 and abc', async () => {
        for (const from of [0, 99, Number('abc'), 1.5]) {
            out = []
            errs = []
            // eslint-disable-next-line no-await-in-loop
            expect(await walkGuide(guide(), opts({from, providedValues: ['t', '0', 'z']}))).to.equal(1)
            expect(errs).to.deep.equal(['--from must be a step number between 1 and 5'])
            expect(out).to.deep.equal([])
        }

        expect(marker('m1-t-0')).to.equal(false)
    })

    it('prints the stop hint on Ctrl+C', async () => {
        selectAnswers = ['run', 'CTRL_C']
        const code = await walkGuide(guide(), opts({providedValues: ['t', '0']}))
        expect(code).to.equal(1)
        expect(out.at(-1)).to.equal('Stopped at step 2. Pick up with: xcute rehearsal t 0 --from 2')
    })

    it('prints the stop hint on Ctrl+C while asking a value', async () => {
        prompts.input = (async () => { throw Object.assign(new Error('x'), {name: 'ExitPromptError'}) }) as unknown as typeof prompts.input
        expect(await walkGuide(guide(), opts())).to.equal(1)
        expect(out.at(-1)).to.equal('Stopped at step 1. Pick up with: xcute rehearsal --from 1')
    })

    it('prints the catalog and topic line in the header', async () => {
        await walkGuide(guide(), opts({catalogName: 'InertiaX', dryRun: true, providedValues: ['t', '0', 'z'], topicTitle: 'Lines'}))
        expect(out.slice(0, 3)).to.deep.equal(['rehearsal', 'Prove the line machinery once.', 'InertiaX · Lines'])
        out = []
        await walkGuide(guide(), opts({catalogName: 'InertiaX', dryRun: true, providedValues: ['t', '0', 'z']}))
        expect(out[2]).to.equal('InertiaX')
    })

    it('dry-run prints everything and executes nothing', async () => {
        inputAnswers = ['table', '0', 'abc']
        const code = await walkGuide(guide(), opts({dryRun: true}))
        expect(code).to.equal(0)
        expect(selectChoices).to.deep.equal([])
        expect(inputMessages).to.have.length(3)
        expect(out.join('\n')).to.contain('abc')
        expect(out.filter((l) => l.startsWith('$ '))).to.have.length(3)
        expect(marker('m1-table-0')).to.equal(false)
    })

    it('runs every step in the catalog directory', async () => {
        selectAnswers = ['run', 'stop']
        await walkGuide(guide(), opts({providedValues: ['t', '0']}))
        expect(marker('m1-t-0')).to.equal(true)
    })
})
