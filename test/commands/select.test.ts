import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {loadCatalog} from '../../src/utils/catalog.js'
import {getCustomConfig, setConfigDir, setIncludePresets} from '../../src/utils/config.js'
import {type PickerChoice} from '../../src/utils/picker.js'
import {prompts} from '../../src/utils/prompts.js'
import {runnableParts, writeTrust} from '../../src/utils/trust.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type SearchOptions = {message: string; source: (term: string | undefined, extra: {signal: AbortSignal}) => any[]}

const signal = new AbortController().signal
const choicesOf = (options: SearchOptions, term?: string): PickerChoice[] =>
    options.source(term, {signal}).filter((choice: any) => choice.value)
const entryNames = (options: SearchOptions, term?: string): string[] =>
    choicesOf(options, term).map((choice) => (choice.value.kind === 'entry' ? choice.value.resolved.name : choice.value.kind))

describe('select', () => {
    let testDir: string
    let originalSearch: typeof prompts.search
    let originalSelect: typeof prompts.select
    let seen: SearchOptions[]
    let cleanup: (() => void) | undefined
    const originalIncludePresets = getCustomConfig().includePresets
    const originalDir = getCustomConfig().customDir

    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-test-'))
        setConfigDir(testDir)
        setIncludePresets(false)
        originalSearch = prompts.search
        originalSelect = prompts.select
        seen = []
    })

    afterEach(() => {
        cleanup?.()
        cleanup = undefined
        fs.rmSync(testDir, {force: true, recursive: true})
        prompts.search = originalSearch
        prompts.select = originalSelect
        setIncludePresets(originalIncludePresets)
        setConfigDir(originalDir)
    })

    function writeConfig(data: Record<string, {commands: string[]; description: string}>) {
        fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify(data))
    }

    /** Answers each search prompt in turn with the first choice picked by `answers[i]` (a function over the options). */
    function answerSearch(...answers: Array<(options: SearchOptions) => unknown>) {
        let call = 0
        prompts.search = (async (options: SearchOptions) => {
            seen.push(options)
            return answers[call++](options)
        }) as any
    }

    const pickEntry = (name: string, term?: string) => (options: SearchOptions) =>
        choicesOf(options, term).find((choice) => choice.value.kind === 'entry' && choice.value.resolved.name === name)!.value
    const pickKind = (kind: string) => (options: SearchOptions) => choicesOf(options).find((choice) => choice.value.kind === kind)!.value

    function repo(source: string) {
        const r = createCatalogRepo(source)
        cleanup = r.cleanup
        const loaded = loadCatalog()!
        writeTrust(loaded.file, runnableParts(loaded.catalog!))
        return r
    }

    const touch = (file: string) => `node -e "require('node:fs').writeFileSync('${file}','x')"`
    const catalogSource = `version: 1
name: Demo
topics:
  build:
    title: Build things
    summary: compile and package
  sites:
    title: Sites & docs
    summary: previews
entries:
  build-api:
    topic: build
    description: Build the API.
    commands:
      - ${touch('built.txt')}
  rerun-site-previews:
    topic: sites
    description: Re-run failed site previews.
    commands:
      - echo previews
  tour:
    topic: sites
    description: A short tour.
    steps:
      - title: Look around
        manual: Open the site.
`

    it('selects and runs an action', async () => {
        writeConfig({'selected-action': {commands: ['echo "selected output"'], description: 'Selected action'}})
        answerSearch(pickEntry('selected-action'))

        const {stdout} = await runCommand(['select'])

        expect(stdout).to.contain('Running action: selected-action')
        expect(stdout).to.contain('selected output')
        expect(seen[0].message).to.equal('What do you need?')
    })

    it('filters actions using a positional argument', async () => {
        writeConfig({
            'build-api': {commands: ['echo "api output"'], description: 'Build API'},
            'deploy-site': {commands: ['echo "site output"'], description: 'Deploy site'},
        })
        answerSearch(pickEntry('build-api'))

        const {stdout} = await runCommand(['select', 'build'])

        expect(entryNames(seen[0])).to.deep.equal(['build-api'])
        expect(seen[0].message).to.equal('What do you need? (filter: build)')
        expect(stdout).to.contain('Running action: build-api')
        expect(stdout).to.contain('api output')
    })

    it('filters actions using the select alias positional argument', async () => {
        writeConfig({
            'lint-api': {commands: ['echo "lint output"'], description: 'Lint API'},
            'test-api': {commands: ['echo "test output"'], description: 'Test API'},
        })
        answerSearch(pickEntry('lint-api'))

        const {stdout} = await runCommand(['s', 'lint'])

        expect(entryNames(seen[0])).to.deep.equal(['lint-api'])
        expect(stdout).to.contain('Running action: lint-api')
        expect(stdout).to.contain('lint output')
    })

    it('keeps the -f filter flag working', async () => {
        writeConfig({
            'format-api': {commands: ['echo "format output"'], description: 'Format API'},
            'release-api': {commands: ['echo "release output"'], description: 'Release API'},
        })
        answerSearch(pickEntry('format-api'))

        const {stdout} = await runCommand(['select', '-f', 'format'])

        expect(entryNames(seen[0])).to.deep.equal(['format-api'])
        expect(stdout).to.contain('Running action: format-api')
        expect(stdout).to.contain('format output')
    })

    it('runs a personal action outside a catalog, with typing', async () => {
        writeConfig({
            'build-api': {commands: ['echo "api output"'], description: 'Build API'},
            'deploy-site': {commands: ['echo "site output"'], description: 'Deploy site'},
        })
        answerSearch((options) => pickEntry('deploy-site', 'site')(options))

        const {stdout} = await runCommand(['select'])

        expect(entryNames(seen[0])).to.deep.equal(['build-api', 'deploy-site'])
        expect(entryNames(seen[0], 'deploy')).to.deep.equal(['deploy-site'])
        expect(stdout).to.contain('site output')
    })

    it('says so when nothing is registered', async () => {
        const {stdout} = await runCommand(['select'])
        expect(stdout).to.contain('No actions registered')
    })

    it('shows personal actions when xcute.yml is invalid', async () => {
        writeConfig({'mine': {commands: ['echo mine'], description: 'Mine'}})
        const r = createCatalogRepo('entries: [oops')
        cleanup = r.cleanup
        answerSearch(pickEntry('mine'))

        const {stderr, stdout} = await runCommand(['select'])

        expect(stderr).to.contain('xcute.yml')
        expect(entryNames(seen[0])).to.deep.equal(['mine'])
        expect(stdout).to.contain('Running action: mine')
    })

    describe('inside a catalog', () => {
        beforeEach(() => writeConfig({mine: {commands: ['echo mine'], description: 'My own action'}}))

        it('opens a topic and goes back', async () => {
            repo(catalogSource)
            let call = 0
            prompts.search = (async (options: SearchOptions) => {
                seen.push(options)
                call++
                if (call === 1) return pickKind('topic')(options)
                if (call === 2) return pickKind('back')(options)
                if (call === 3) return pickKind('topic')(options)
                return pickEntry('build-api')(options)
            }) as any

            const {stdout} = await runCommand(['select'])

            expect(call).to.equal(4)
            expect(stdout).to.contain('Running action: build-api')
            expect(fs.existsSync('built.txt')).to.equal(true)
        })

        it('asks Walk through it / Just read it for a guide and reads it', async () => {
            repo(catalogSource)
            answerSearch((options) => pickEntry('tour', 'tour')(options))
            let selectOptions: any
            prompts.select = (async (options: any) => {
                selectOptions = options
                return 'read'
            }) as any

            const {stdout} = await runCommand(['select'])

            expect(selectOptions.choices.map((choice: any) => choice.name)).to.deep.equal(['Walk through it', 'Just read it'])
            expect(stdout).to.contain('Look around')
            expect(stdout).not.to.contain('Running action')
        })

        it('prints the header and applies the CLI filter before the typed term', async () => {
            repo(catalogSource)
            answerSearch(pickEntry('build-api', 'build'))

            const {stdout} = await runCommand(['select', 'build'])

            expect(stdout).to.contain('Demo · 3 entries in 2 topics · 1 of your actions')
            expect(entryNames(seen[0])).to.deep.equal(['build-api'])
            expect(entryNames(seen[0], 'site')).to.deep.equal([])
            expect(stdout).to.contain('Running action: build-api')
        })

        it('runs a personal action picked from the Your actions group', async () => {
            repo(catalogSource)
            let call = 0
            prompts.search = (async (options: SearchOptions) => {
                seen.push(options)
                call++
                return call === 1 ? pickKind('personal-topic')(options) : pickEntry('mine')(options)
            }) as any

            const {stdout} = await runCommand(['select'])

            expect(stdout).to.contain('Running action: mine')
        })
    })
})
