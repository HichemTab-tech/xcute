import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import SyncPush from '../../src/commands/sync-push.js'
import {saveConfig, setConfigDir} from '../../src/utils/config.js'
import {loadSyncState, saveSyncState} from '../../src/utils/sync.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

describe('sync-push', () => {
    let testDir: string
    let repoDir: string
    let executedGitCommands: string[][]
    const originalGit = SyncPush.prototype.git

    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcute-sync-push-'))
        repoDir = path.join(testDir, 'sync-repo')
        executedGitCommands = []
        fs.mkdirSync(repoDir, {recursive: true})
        setConfigDir(testDir)

        saveConfig({
            shared: {
                commands: ['echo local'],
            },
        })

        fs.writeFileSync(path.join(repoDir, 'xcute.json'), JSON.stringify({
            shared: {
                commands: ['echo remote'],
            },
        }, null, 2))

        saveSyncState({
            lastSyncedConfig: {
                shared: {
                    commands: ['echo base'],
                },
            },
            registryFile: 'xcute.json',
            repoDir,
            repoUrl: 'git@github.com:example/xcute-sync.git',
        })

        SyncPush.prototype.git = (args: string[]) => {
            executedGitCommands.push(args)

            if (args[0] === 'ls-remote') {
                return 'abc123\trefs/heads/main'
            }

            return ''
        }
    })

    afterEach(() => {
        SyncPush.prototype.git = originalGit
        fs.rmSync(testDir, {force: true, recursive: true})
    })

    it('pushes merged local changes back to the sync repo', async () => {
        const {stdout} = await runCommand(['sync-push', '--strategy', 'local'])

        expect(stdout).to.contain('Sync push complete. Added: 0, Updated: 1, Removed: 0, Conflicts: 1')
        expect(executedGitCommands).to.deep.equal([
            ['ls-remote', '--heads', 'origin'],
            ['pull', '--ff-only'],
            ['add', 'xcute.json'],
            ['commit', '-m', 'sync xcute registry'],
            ['push', '--set-upstream', 'origin', 'HEAD'],
        ])

        const remoteConfig = JSON.parse(fs.readFileSync(path.join(repoDir, 'xcute.json'), 'utf8'))
        expect(remoteConfig.shared.commands).to.deep.equal(['echo local'])

        const state = loadSyncState()
        expect(state?.lastSyncedConfig.shared.commands).to.deep.equal(['echo local'])
    })

    it('skips pull when the remote repository is still empty', async () => {
        executedGitCommands = []
        SyncPush.prototype.git = (args: string[]) => {
            executedGitCommands.push(args)

            if (args[0] === 'ls-remote') {
                return ''
            }

            return ''
        }

        const {stdout} = await runCommand(['sync-push', '--strategy', 'local'])

        expect(stdout).to.contain('Sync push complete. Added: 0, Updated: 1, Removed: 0, Conflicts: 1')
        expect(executedGitCommands).to.deep.equal([
            ['ls-remote', '--heads', 'origin'],
            ['add', 'xcute.json'],
            ['commit', '-m', 'sync xcute registry'],
            ['push', '--set-upstream', 'origin', 'HEAD'],
        ])
    })

    it('never pushes catalog entries to the sync snapshot', async () => {
        const repo = createCatalogRepo('version: 1\nentries:\n  lint:\n    description: Lint.\n    commands:\n      - pnpm lint\n')
        try {
            await runCommand(['sync-push', '--strategy', 'local'])
        } finally {
            repo.cleanup()
        }

        const remoteConfig = JSON.parse(fs.readFileSync(path.join(repoDir, 'xcute.json'), 'utf8'))
        expect(Object.keys(remoteConfig)).to.deep.equal(['shared'])
        expect(Object.keys(loadSyncState()!.lastSyncedConfig)).to.deep.equal(['shared'])
    })
})
