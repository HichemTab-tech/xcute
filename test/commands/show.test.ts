import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {setConfigDir} from '../../src/utils/config.js'
import {terminal} from '../../src/utils/prompts.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

describe('show', () => {
    let testDir: string
    let cleanup: (() => void) | undefined
    let originalInteractive: typeof terminal.isInteractive

    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-test-'))
        setConfigDir(testDir)
        originalInteractive = terminal.isInteractive
        terminal.isInteractive = () => false
    })

    afterEach(() => {
        terminal.isInteractive = originalInteractive
        cleanup?.()
        cleanup = undefined
        fs.rmSync(testDir, {force: true, recursive: true})
    })

    it('prints a personal action with placeholders', async () => {
        fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify({
            deploy: {commands: ['echo deploy {{env::Environment}}'], description: 'Deploy it'},
        }))

        const {stdout} = await runCommand(['show', 'deploy'])
        expect(stdout).to.contain('deploy')
        expect(stdout).to.contain('Deploy it')
        expect(stdout).to.contain('$ echo deploy <env>')

        const filled = await runCommand(['show', 'deploy', 'prod'])
        expect(filled.stdout).to.contain('$ echo deploy prod')
    })

    it('needs no trust', async () => {
        const r = createCatalogRepo(`entries:
  walk:
    description: Walk.
    steps:
      - title: Build
        run: echo hi
`)
        cleanup = r.cleanup

        const {error, stdout} = await runCommand(['show', 'walk'])
        expect(error).to.equal(undefined)
        expect(stdout).to.contain('1. Build')
        expect(stdout).to.contain('$ echo hi')
        expect(stdout).to.not.contain('xcute trust')
    })

    it('reports an unknown name', async () => {
        const {error} = await runCommand(['show', 'nope'])
        expect(error?.message).to.contain('Action "nope" not found')
    })
})
