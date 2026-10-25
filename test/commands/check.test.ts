import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {createCatalogRepo} from '../helpers/catalog-repo.js'

const source = (command: string) => `version: 1
entries:
  build:
    description: Build.
    commands:
      - ${command}
`

describe('check command', () => {
    let cleanup: (() => void) | undefined

    afterEach(() => {
        cleanup?.()
        cleanup = undefined
    })

    function repo(text: string, scripts: Record<string, string>) {
        const r = createCatalogRepo(text)
        cleanup = r.cleanup
        fs.writeFileSync(path.join(r.dir, 'package.json'), JSON.stringify({scripts}))
        return r
    }

    it('xcute check exits 1 on a missing script and 0 when only uncovered scripts remain', async () => {
        repo(source('pnpm gone'), {build: 'x'})
        const failed = await runCommand(['check'])
        expect(failed.error?.oclif?.exit).to.equal(1)
        expect(failed.stdout).to.contain('Missing scripts:').and.contain('  build calls "gone", which is not in package.json')
        expect(failed.stdout).to.contain('Scripts no entry mentions (1):')

        cleanup?.()
        repo(source('pnpm build'), {build: 'x', lint: 'x'})
        const ok = await runCommand(['check'])
        expect(ok.error).to.equal(undefined)
        expect(ok.stdout).to.contain('OK (1 entries)').and.contain('Scripts no entry mentions (1):').and.contain('lint')
    })

    it('xcute check lists validation errors with line numbers', async () => {
        repo('version: 1\nentries:\n  build:\n    description: Build.\n', {})
        const {error, stdout} = await runCommand(['check'])
        expect(error?.oclif?.exit).to.equal(1)
        expect(stdout).to.match(/xcute\.yml:\d+/)
    })

    it('xcute check fails without a catalog', async () => {
        const r = createCatalogRepo(undefined)
        cleanup = r.cleanup
        const {error} = await runCommand(['check'])
        expect(error?.message).to.contain('No xcute.yml found from here.')
    })
})
