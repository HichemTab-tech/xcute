import {expect} from 'chai'
import fs from 'node:fs'
import path from 'node:path'

import {findCatalogFile, loadCatalog} from '../../src/utils/catalog.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

describe('catalog discovery', () => {
    const cleanups: Array<() => void> = []
    const repo = (...args: Parameters<typeof createCatalogRepo>) => {
        const created = createCatalogRepo(...args)
        cleanups.push(created.cleanup)
        return created
    }

    afterEach(() => {
        while (cleanups.length > 0) cleanups.pop()!()
    })

    it('finds xcute.yml in the current directory', () => {
        const {dir} = repo('name: A\n')
        expect(findCatalogFile(dir)).to.equal(path.join(dir, 'xcute.yml'))
    })

    it('finds the root catalog from a nested folder', () => {
        const {dir} = repo('name: A\n')
        const cwd = path.join(dir, 'packages', 'foo')
        fs.mkdirSync(cwd, {recursive: true})
        expect(findCatalogFile(cwd)).to.equal(path.join(dir, 'xcute.yml'))
    })

    it('stops at the repository root', () => {
        const {dir: parent} = repo('name: A\n', {git: false})
        const inner = path.join(parent, 'repo')
        fs.mkdirSync(path.join(inner, '.git'), {recursive: true})
        expect(findCatalogFile(inner)).to.equal(undefined)
    })

    it('treats a .git file (worktree) as the repository root', () => {
        const {dir: parent} = repo('name: A\n', {git: false})
        const inner = path.join(parent, 'repo')
        fs.mkdirSync(inner)
        fs.writeFileSync(path.join(inner, '.git'), 'gitdir: /elsewhere\n')
        expect(findCatalogFile(inner)).to.equal(undefined)
    })

    it('only checks the current directory outside a git repository', () => {
        const {dir} = repo('name: A\n', {git: false})
        const sub = path.join(dir, 'sub')
        fs.mkdirSync(sub)
        expect(findCatalogFile(sub)).to.equal(undefined)
        expect(findCatalogFile(dir)).to.equal(path.join(dir, 'xcute.yml'))
    })

    it('resolves symlinks so the same repo has one file path', () => {
        const {dir} = repo('name: A\n')
        const link = path.join(path.dirname(dir), `${path.basename(dir)}-link`)
        fs.symlinkSync(dir, link)
        try {
            const viaLink = loadCatalog(link)
            expect(viaLink?.file).to.equal(path.join(dir, 'xcute.yml'))
            expect(viaLink?.file).to.equal(loadCatalog(dir)?.file)
        } finally {
            fs.rmSync(link, {force: true})
        }
    })

    it('returns parse errors formatted with the file path', () => {
        const {dir} = repo('entries: [\n')
        const loaded = loadCatalog(dir)
        expect(loaded?.errors.length).to.be.greaterThan(0)
        for (const error of loaded!.errors) expect(error).to.contain(path.join(dir, 'xcute.yml'))
    })

    it('reports an xcute.yml directory as unreadable instead of throwing', () => {
        const {dir} = repo(undefined)
        fs.mkdirSync(path.join(dir, 'xcute.yml'))
        const loaded = loadCatalog(dir)
        expect(loaded?.catalog).to.equal(undefined)
        expect(loaded?.errors).to.have.length(1)
        expect(loaded?.errors[0]).to.contain(`${path.join(dir, 'xcute.yml')}: cannot read: `)
    })

    it('names the catalog after its folder when name is missing', () => {
        const {dir} = repo('version: 1\n')
        expect(loadCatalog(dir)?.name).to.equal(path.basename(dir))
    })

    it('uses the catalog name when present', () => {
        const {dir} = repo('name: Demo\nentries:\n  hi:\n    description: Say hi\n    commands:\n      - echo hi\n')
        expect(loadCatalog(dir)?.name).to.equal('Demo')
    })

    it('returns undefined when there is no catalog', () => {
        const {dir} = repo(undefined)
        expect(loadCatalog(dir)).to.equal(undefined)
    })
})
