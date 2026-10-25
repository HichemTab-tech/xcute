import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {setConfigDir} from '../../src/utils/config.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

describe('remove', () => {
    let testDir: string

    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-test-'))
        setConfigDir(testDir)
    })

    afterEach(() => {
        fs.rmSync(testDir, {force: true, recursive: true})
    })

    it('removes an action with --yes flag', async () => {
        // Setup - add an action first
        const configPath = path.join(testDir, 'config.json')
        const configData = {
            'keep-me': {
                commands: ['echo hi'],
                description: 'Keep me'
            },
            'to-remove': {
                commands: ['echo bye'],
                description: 'To remove'
            }
        }
        fs.writeFileSync(configPath, JSON.stringify(configData))

        const {stdout} = await runCommand(['remove', 'to-remove', '--yes'])
        expect(stdout).to.contain('Action "to-remove" removed')

        const content = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        expect(content['to-remove']).to.not.exist
        expect(content['keep-me']).to.exist
    })

    it('errors if action does not exist', async () => {
        try {
            await runCommand(['remove', 'non-existent', '--yes'])
        } catch (error) {
            expect((error as Error).message).to.contain('not found')
        }
    })

    it('refuses to remove a catalog-only entry and names the file', async () => {
        const repo = createCatalogRepo('version: 1\nentries:\n  lint:\n    description: Lint.\n    commands:\n      - pnpm lint\n')
        try {
            const {error} = await runCommand(['remove', 'lint', '--yes'])
            expect(error?.message).to.contain('"lint" comes from')
            expect(error?.message).to.contain(path.join(repo.dir, 'xcute.yml'))
            expect(error?.message).to.contain('Edit that file to remove it.')
        } finally {
            repo.cleanup()
        }
    })
})
