import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
    deleteAction,
    getAllActions,
    getAction,
    setConfigDir,
    setAction,
    actionExists,
    getConfigDir,
} from '../../src/utils/config.js'

describe('config utilities', () => {
    let testDir: string

    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-test-'))
        setConfigDir(testDir)
    })

    afterEach(() => {
        fs.rmSync(testDir, {force: true, recursive: true})
    })

    it('saves, loads and deletes an action', () => {
        const tpl = {commands: ['echo hi'], description: 'desc'}
        setAction('my-tpl', tpl)

        expect(actionExists('my-tpl')).to.equal(true)

        const loaded = getAction('my-tpl')
        expect(loaded).to.not.be.undefined
        expect(loaded!.commands).to.deep.equal(['echo hi'])
        expect(loaded!.description).to.equal('desc')

        const deleted = deleteAction('my-tpl')
        expect(deleted).to.equal(true)
        expect(actionExists('my-tpl')).to.equal(false)
    })

    it('does not treat Object.prototype names as actions', () => {
        setAction('real', {commands: ['echo a']})
        for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
            expect(getAction(name), name).to.equal(undefined)
            expect(actionExists(name), name).to.equal(false)
            expect(deleteAction(name), name).to.equal(false)
        }

        expect(getAction('real')).to.deep.equal({commands: ['echo a']})
    })

    it('returns filtered actions with getAllActions', () => {
        setAction('selected', {commands: ['echo a']})
        setAction('other', {commands: ['echo b']})

        const all = getAllActions()
        expect(Object.keys(all)).to.include.members(['selected', 'other'])

        const filtered = getAllActions('sel')
        expect(Object.keys(filtered)).to.deep.equal(['selected'])
    })

    describe('getConfigDir', () => {
        const savedHome = process.env.XCUTE_HOME
        const savedNodeEnv = process.env.NODE_ENV

        beforeEach(() => {
            setConfigDir(undefined)
        })

        afterEach(() => {
            setConfigDir(undefined)
            if (savedHome === undefined) delete process.env.XCUTE_HOME
            else process.env.XCUTE_HOME = savedHome
            if (savedNodeEnv === undefined) delete process.env.NODE_ENV
            else process.env.NODE_ENV = savedNodeEnv
        })

        it('uses XCUTE_HOME when no override is set', () => {
            process.env.XCUTE_HOME = '/tmp/xcute-home-test'
            expect(getConfigDir()).to.equal('/tmp/xcute-home-test')
        })

        it('resolves a relative XCUTE_HOME against the current directory', () => {
            process.env.XCUTE_HOME = 'rel-home'
            expect(getConfigDir()).to.equal(path.resolve('rel-home'))
        })

        it('ignores an empty XCUTE_HOME', () => {
            process.env.XCUTE_HOME = ''
            delete process.env.NODE_ENV
            expect(getConfigDir()).to.equal(path.join(os.homedir(), '.xcute'))
        })

        it('lets XCUTE_HOME win over NODE_ENV=development', () => {
            process.env.NODE_ENV = 'development'
            process.env.XCUTE_HOME = '/tmp/xcute-home-test'
            expect(getConfigDir()).to.equal('/tmp/xcute-home-test')
        })

        it('keeps the setConfigDir override above XCUTE_HOME', () => {
            process.env.XCUTE_HOME = '/tmp/xcute-home-test'
            setConfigDir('/tmp/override')
            expect(getConfigDir()).to.equal('/tmp/override')
        })
    })
})