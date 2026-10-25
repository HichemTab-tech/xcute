import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {createCatalogRepo} from '../helpers/catalog-repo.js'
import {getCustomConfig, setConfigDir, setIncludePresets} from '../../src/utils/config.js'

describe('list', () => {
    let testDir: string
    const originalIncludePresent = getCustomConfig().includePresets
    const originalDir = getCustomConfig().customDir

    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-test-'))
        setConfigDir(testDir)
        setIncludePresets(false);
    })

    afterEach(() => {
        fs.rmSync(testDir, {force: true, recursive: true})
        setIncludePresets(originalIncludePresent)
        setConfigDir(originalDir)
    })

    it('runs list with empty config', async () => {
        const {stdout} = await runCommand(['list'])
        expect(stdout).to.contain('No actions registered')
    })

    it('runs list with existing actions', async () => {
        const configPath = path.join(testDir, 'config.json')
        const configData = {
            'test-action': {
                commands: ['echo hello'],
                description: 'A test action'
            }
        }
        fs.writeFileSync(configPath, JSON.stringify(configData))

        const {stdout} = await runCommand(['list'])
        expect(stdout).to.contain('test-action')
        expect(stdout).to.contain('A test action')
    })

    it('filters actions by name with the filter flag', async () => {
        const configPath = path.join(testDir, 'config.json')
        const configData = {
            'react-app': {
                commands: ['echo react'],
                description: 'React action'
            },
            'vue-app': {
                commands: ['echo vue'],
                description: 'Vue action'
            }
        }
        fs.writeFileSync(configPath, JSON.stringify(configData))

        const {stdout} = await runCommand(['list', '-f', 'react'])
        expect(stdout).to.contain('react-app')
        expect(stdout).to.not.contain('vue-app')
    })

    it('keeps saying No actions registered outside a catalog when -f matches nothing', async () => {
        fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify({'react-app': {commands: ['echo react']}}))
        const {stdout} = await runCommand(['list', '-f', 'zzz'])
        expect(stdout.trim()).to.equal('No actions registered')
    })

    describe('inside a catalog', () => {
        const source = `version: 1
name: Demo
topics:
  lines:
    title: Lines
entries:
  rehearsal:
    topic: lines
    description: Rehearse a release.
    steps:
      - title: One
        run: echo 1
      - title: Two
        manual: Do it.
      - title: Three
        check: Look.
      - title: Four
        run: echo 4
      - title: Five
        run: echo 5
  rerun-site-previews:
    description: Re-run failed site previews.
    commands:
      - echo rerun
`
        let repo: ReturnType<typeof createCatalogRepo> | undefined

        afterEach(() => {
            repo?.cleanup()
            repo = undefined
        })

        const writePersonal = (data: object) => fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify(data))

        it('groups catalog entries by topic, then Your actions', async () => {
            writePersonal({mine: {commands: ['echo mine'], description: 'Personal'}})
            repo = createCatalogRepo(source)
            const {stdout} = await runCommand(['list'])
            const at = (text: string) => stdout.indexOf(text)
            expect(at('Lines')).to.be.greaterThan(-1)
            expect(at('Lines')).to.be.lessThan(at('rehearsal'))
            expect(at('rehearsal')).to.be.lessThan(at('Other'))
            expect(at('Other')).to.be.lessThan(at('rerun-site-previews'))
            expect(at('rerun-site-previews')).to.be.lessThan(at('Your actions'))
            expect(at('Your actions')).to.be.lessThan(at('mine'))
        })

        it('marks guides with their step count without -c', async () => {
            repo = createCatalogRepo(source)
            for (const args of [['list'], ['list', '--no-table']]) {
                const {stdout} = await runCommand(args)
                expect(stdout).to.contain('(guide, 5 steps)')
                expect(stdout.match(/guide/g)).to.have.length(1)
            }
        })

        it('shows guides as steps with -c', async () => {
            repo = createCatalogRepo(source)
            const {stdout} = await runCommand(['list', '-c'])
            expect(stdout).to.contain('5 steps')
            expect(stdout).to.contain('echo rerun')
        })

        it('marks a shadowed catalog entry', async () => {
            writePersonal({rehearsal: {commands: ['echo mine']}})
            repo = createCatalogRepo(source)
            const {stdout} = await runCommand(['list'])
            expect(stdout).to.contain('rehearsal (your action wins)')
        })

        it('does not mark an entry named like an Object.prototype member as shadowed', async () => {
            writePersonal({mine: {commands: ['echo mine']}})
            repo = createCatalogRepo('entries:\n  constructor:\n    description: Build it.\n    commands: [echo built]\n')
            const {stdout} = await runCommand(['list'])
            expect(stdout).to.contain('constructor')
            expect(stdout).to.not.contain('your action wins')
        })

        it('filters by description words with -f', async () => {
            repo = createCatalogRepo(source)
            const {stdout} = await runCommand(['list', '-f', '"preview fail"'])
            expect(stdout).to.contain('rerun-site-previews')
            expect(stdout).to.not.contain('rehearsal')
        })

        it('says nothing matches when -f finds no entry or action', async () => {
            writePersonal({mine: {commands: ['echo mine'], description: 'Personal'}})
            repo = createCatalogRepo(source)
            const {stdout} = await runCommand(['list', '-f', 'zzz'])
            expect(stdout.trim()).to.equal('No actions match "zzz"')
        })

        it('prints catalog errors and still lists personal actions', async () => {
            writePersonal({mine: {commands: ['echo mine'], description: 'Personal'}})
            repo = createCatalogRepo('')
            const {stdout} = await runCommand(['list'])
            expect(stdout).to.contain('xcute.yml')
            expect(stdout).to.contain('mine')
        })
    })
})
