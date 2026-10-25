import {expect} from 'chai'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {loadCatalog} from '../../src/utils/catalog.js'
import {checkCatalog, scriptCalledBy} from '../../src/utils/check.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

describe('check utils', () => {
    let cleanup: (() => void) | undefined

    afterEach(() => {
        cleanup?.()
        cleanup = undefined
    })

    it('reads scripts from pnpm, npm, yarn and bun forms', () => {
        expect(scriptCalledBy('pnpm release:plan')).to.deep.equal(['release:plan'])
        expect(scriptCalledBy('pnpm run lint')).to.deep.equal(['lint'])
        expect(scriptCalledBy('npm run x')).to.deep.equal(['x'])
        expect(scriptCalledBy('npm run-script y')).to.deep.equal(['y'])
        expect(scriptCalledBy('yarn build')).to.deep.equal(['build'])
        expect(scriptCalledBy('yarn run z')).to.deep.equal(['z'])
        expect(scriptCalledBy('bun run w')).to.deep.equal(['w'])
    })

    it('ignores package manager built-ins and filtered commands', () => {
        expect(scriptCalledBy('pnpm install')).to.deep.equal([])
        expect(scriptCalledBy('yarn add left-pad')).to.deep.equal([])
        expect(scriptCalledBy('pnpm --filter a dev')).to.deep.equal([])
        expect(scriptCalledBy('pnpm -r run build')).to.deep.equal([])
    })

    it('knows more pnpm and yarn built-ins', () => {
        for (const command of ['pnpm version patch', 'pnpm view react', 'pnpm info react', 'pnpm whoami', 'pnpm doctor', 'pnpm cache list', 'pnpm help', 'pnpm self-update']) {
            expect(scriptCalledBy(command), command).to.deep.equal([])
        }

        for (const command of ['yarn version', 'yarn why react', 'yarn info react', 'yarn config get x', 'yarn cache clean', 'yarn workspaces list', 'yarn set version stable', 'yarn plugin import x', 'yarn npm publish', 'yarn link', 'yarn pack', 'yarn publish', 'yarn bin', 'yarn dedupe', 'yarn explain x', 'yarn rebuild', 'yarn unlink']) {
            expect(scriptCalledBy(command), command).to.deep.equal([])
        }
    })

    it('reads pnpm t as the test script', () => {
        expect(scriptCalledBy('pnpm t')).to.deep.equal(['test'])
        expect(scriptCalledBy('pnpm run t')).to.deep.equal(['t'])
    })

    it('treats a bare name with a node_modules/.bin entry as a binary', () => {
        const {dir} = (() => {
            const r = createCatalogRepo(undefined)
            cleanup = r.cleanup
            return r
        })()
        const bin = path.join(dir, 'node_modules', '.bin')
        fs.mkdirSync(bin, {recursive: true})
        fs.writeFileSync(path.join(bin, 'eslint'), '')
        expect(scriptCalledBy('pnpm eslint .', bin)).to.deep.equal([])
        expect(scriptCalledBy('pnpm other', bin)).to.deep.equal(['other'])
    })

    it('splits chained commands', () => {
        expect(scriptCalledBy('pnpm a && pnpm run b')).to.deep.equal(['a', 'b'])
        expect(scriptCalledBy('cd x; pnpm c || npm run d')).to.deep.equal(['c', 'd'])
    })

    it('reports missing scripts and uncovered scripts from guides too', () => {
        const r = createCatalogRepo(`version: 1
entries:
  build:
    description: Build.
    commands:
      - pnpm build
      - pnpm gone
  ship:
    description: Ship.
    steps:
      - title: Release
        run: pnpm run release
      - title: Oops
        run: pnpm nope
`)
        cleanup = r.cleanup
        fs.writeFileSync(
            path.join(r.dir, 'package.json'),
            JSON.stringify({scripts: {build: 'x', lint: 'x', release: 'x', test: 'x'}}),
        )
        const report = checkCatalog(loadCatalog()!)
        expect(report.noPackageJson).to.equal(false)
        expect(report.missingScripts).to.deep.equal([
            {entry: 'build', script: 'gone'},
            {entry: 'ship', script: 'nope'},
        ])
        expect(report.uncoveredScripts).to.deep.equal(['lint', 'test'])
    })

    it('handles a catalog without package.json', () => {
        const r = createCatalogRepo(`version: 1
entries:
  build:
    description: Build.
    commands:
      - pnpm build
`)
        cleanup = r.cleanup
        const report = checkCatalog(loadCatalog()!)
        expect(report.noPackageJson).to.equal(true)
        expect(report.missingScripts).to.deep.equal([])
    })
})
