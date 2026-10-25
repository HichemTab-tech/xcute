import {runCommand} from '@oclif/test'
import type {Config} from '@oclif/core'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import commandNotFoundHook from '../../src/hooks/command_not_found.js'
import {loadCatalog} from '../../src/utils/catalog.js'
import {setConfigDir} from '../../src/utils/config.js'
import {prompts, terminal} from '../../src/utils/prompts.js'
import {runnableParts, writeTrust} from '../../src/utils/trust.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

describe('run', () => {
    let testDir: string

    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-test-'))
        setConfigDir(testDir)
    })

    afterEach(() => {
        fs.rmSync(testDir, {force: true, recursive: true})
    })

    it('runs an action command', async () => {
        const configPath = path.join(testDir, 'config.json')
        const configData = {
            'test-run': {
                commands: ['echo "run test output"'],
                description: 'Run test'
            }
        }
        fs.writeFileSync(configPath, JSON.stringify(configData))

        const {stdout} = await runCommand(['run', 'test-run'])
        expect(stdout).to.contain('run test output')
    })

    it('shows the final command without executing it when dry-run is enabled', async () => {
        const outputPath = path.join(testDir, 'dry-run-output.txt')
        const escapedOutputPath = JSON.stringify(outputPath)
        const configPath = path.join(testDir, 'config.json')
        const configData = {
            'test-run': {
                commands: [`node -e "require('node:fs').writeFileSync(${escapedOutputPath}, 'ran')"`],
                description: 'Run test'
            }
        }
        fs.writeFileSync(configPath, JSON.stringify(configData))

        const {stdout} = await runCommand(['run', 'test-run', '--dry-run'])
        expect(stdout).to.contain('$ node -e')
        expect(fs.existsSync(outputPath)).to.equal(false)
    })

    it('shows the final command without executing it when fallback run uses dry-run', async () => {
        const outputPath = path.join(testDir, 'fallback-dry-run-output.txt')
        const escapedOutputPath = JSON.stringify(outputPath)
        const configPath = path.join(testDir, 'config.json')
        const configData = {
            'test-run': {
                commands: [`node -e "require('node:fs').writeFileSync(${escapedOutputPath}, 'ran')"`],
                description: 'Run test'
            }
        }
        fs.writeFileSync(configPath, JSON.stringify(configData))

        const originalArgv = process.argv
        const originalExit = process.exit
        const originalLog = console.log
        const originalError = console.error
        const stdout: string[] = []
        const stderr: string[] = []

        try {
            process.argv = ['node', 'bin/run.js', 'test-run', '--dry-run']
            console.log = (message?: unknown) => {
                stdout.push(String(message ?? ''))
            }
            console.error = (message?: unknown) => {
                stderr.push(String(message ?? ''))
            }
            process.exit = ((code?: number) => {
                throw new Error(`EXIT:${code ?? 0}`)
            }) as typeof process.exit

            await commandNotFoundHook.call({config: {} as Config} as never, {id: 'test-run'} as never)
        } catch (error) {
            if (!(error instanceof Error) || error.message !== 'EXIT:0') {
                throw error
            }
        } finally {
            process.argv = originalArgv
            process.exit = originalExit
            console.log = originalLog
            console.error = originalError
        }

        expect(stdout.join('\n')).to.contain('$ node -e')
        expect(stderr).to.have.length(0)
        expect(fs.existsSync(outputPath)).to.equal(false)
    })

    describe('project catalogs', () => {
        let cleanup: (() => void) | undefined
        let originalInteractive: typeof terminal.isInteractive

        const touch = (file: string) => `node -e "require('node:fs').writeFileSync('${file}','x')"`
        const catalogSource = (extra = '') => `version: 1
entries:
  make-file:
    description: Make a file.
    commands:
      - ${touch('ran.txt')}
  release:plan:
    description: Plan.
    commands:
      - pnpm release:plan
${extra}`

        function repo(source: string, trust = true) {
            const r = createCatalogRepo(source)
            cleanup = r.cleanup
            if (trust) {
                const loaded = loadCatalog()!
                writeTrust(loaded.file, runnableParts(loaded.catalog!))
            }

            return r
        }

        async function runHook(argv: string[], id: string) {
            const originalArgv = process.argv
            const originalExit = process.exit
            const originalLog = console.log
            const originalError = console.error
            const stdout: string[] = []
            const stderr: string[] = []
            let code = -1
            try {
                process.argv = ['node', 'bin/run.js', ...argv]
                console.log = (m?: unknown) => { stdout.push(String(m ?? '')) }
                console.error = (m?: unknown) => { stderr.push(String(m ?? '')) }
                process.exit = ((c?: number) => { throw new Error(`EXIT:${c ?? 0}`) }) as typeof process.exit
                await commandNotFoundHook.call({config: {} as Config} as never, {id} as never)
                code = -2
            } catch (error) {
                const match = error instanceof Error ? /^EXIT:(\d+)$/.exec(error.message) : null
                if (!match) throw error
                code = Number(match[1])
            } finally {
                process.argv = originalArgv
                process.exit = originalExit
                console.log = originalLog
                console.error = originalError
            }

            return {code, stderr: stderr.join('\n'), stdout: stdout.join('\n')}
        }

        beforeEach(() => {
            originalInteractive = terminal.isInteractive
            terminal.isInteractive = () => false
        })

        afterEach(() => {
            terminal.isInteractive = originalInteractive
            cleanup?.()
            cleanup = undefined
        })

        it('runs a project entry from the catalog directory', async () => {
            const {dir} = repo(catalogSource())
            fs.mkdirSync(path.join(dir, 'packages', 'foo'), {recursive: true})
            process.chdir(path.join(dir, 'packages', 'foo'))

            await runCommand(['run', 'make-file'])
            expect(fs.existsSync(path.join(dir, 'ran.txt'))).to.equal(true)
        })

        it('prefers the personal action on a clash and --project reaches the catalog one', async () => {
            const {dir} = repo(catalogSource())
            fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify({'make-file': {commands: ['echo personal-one']}}))

            const personal = await runCommand(['run', 'make-file'])
            expect(personal.stdout).to.contain('personal-one')
            expect(fs.existsSync(path.join(dir, 'ran.txt'))).to.equal(false)

            await runCommand(['run', 'make-file', '--project'])
            expect(fs.existsSync(path.join(dir, 'ran.txt'))).to.equal(true)
        })

        it('refuses an untrusted catalog without a TTY and runs nothing', async () => {
            const {dir} = repo(catalogSource(), false)

            const {error, stdout} = await runCommand(['run', 'make-file'])
            expect(error?.oclif?.exit).to.equal(1)
            expect(stdout).to.contain('xcute trust')
            expect(fs.existsSync(path.join(dir, 'ran.txt'))).to.equal(false)
        })

        it('dry-runs a project entry without asking for trust', async () => {
            const {dir} = repo(catalogSource(), false)

            const {stdout} = await runCommand(['run', 'make-file', '--dry-run'])
            expect(stdout).to.contain('$ node -e')
            expect(fs.existsSync(path.join(dir, 'ran.txt'))).to.equal(false)
        })

        it('runs a colon-named entry through the shortcut hook', async () => {
            repo(catalogSource())

            const result = await runHook(['release:plan', '--dry-run'], 'release:plan')
            expect(result.stdout).to.contain('$ pnpm release:plan')
            expect(result.code).to.equal(0)
        })

        it('runs a colon-named personal action through the shortcut hook', async () => {
            fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify({'ci:lint': {commands: ['echo linting']}}))

            const result = await runHook(['ci:lint', '--dry-run'], 'ci:lint')
            expect(result.stdout).to.contain('$ echo linting')
        })

        describe('guides', () => {
            const originalSelect = prompts.select
            let answers: string[]
            let selectCalls: number

            const guideSource = `version: 1
name: Demo
topics:
  ops:
    title: Operations
entries:
  rehearsal:
    topic: ops
    description: Rehearse.
    steps:
      - title: First {{component::Component}} {{major::Major}}
        run: ${touch('m1.txt')}
      - title: Hand step
        manual: Do it.
      - title: Third
        run: ${touch('m3.txt')}
      - title: Fourth
        run: ${touch('m4.txt')}
`

            beforeEach(() => {
                answers = []
                selectCalls = 0
                prompts.select = (async () => {
                    selectCalls++
                    return answers.shift()
                }) as unknown as typeof prompts.select
            })

            afterEach(() => {
                prompts.select = originalSelect
            })

            it('walks a trusted guide through xcute run', async () => {
                const {dir} = repo(guideSource)
                answers = ['run', 'continue', 'run', 'run']

                const {stdout} = await runCommand(['run', 'rehearsal', 'table', '0'])
                expect(stdout).to.contain('Demo · Operations')
                expect(stdout).to.contain('Guide done.')
                expect(fs.existsSync(path.join(dir, 'm1.txt'))).to.equal(true)
                expect(fs.existsSync(path.join(dir, 'm4.txt'))).to.equal(true)
            })

            it('walks a guide through the shortcut with values and --from', async () => {
                const {dir} = repo(guideSource)
                answers = ['run']

                const result = await runHook(['rehearsal', 'table', '0', '--from', '4'], 'rehearsal')
                expect(result.code).to.equal(0)
                expect(result.stdout).to.contain('4/4')
                expect(fs.existsSync(path.join(dir, 'm1.txt'))).to.equal(false)
                expect(fs.existsSync(path.join(dir, 'm4.txt'))).to.equal(true)
            })

            it('asks for trust before the first step of an untrusted guide', async () => {
                const {dir} = repo(guideSource, false)
                terminal.isInteractive = () => true
                answers = ['trust', 'run', 'continue', 'run', 'run']

                await runCommand(['run', 'rehearsal', 'table', '0'])
                expect(fs.existsSync(path.join(dir, 'm1.txt'))).to.equal(true)
                expect(selectCalls).to.equal(5)
            })

            it('refuses an untrusted guide without a TTY', async () => {
                const {dir} = repo(guideSource, false)

                const {error} = await runCommand(['run', 'rehearsal', 'table', '0'])
                expect(error?.oclif?.exit).to.equal(1)
                expect(selectCalls).to.equal(0)
                expect(fs.existsSync(path.join(dir, 'm1.txt'))).to.equal(false)
            })

            it('dry-runs a guide without trust', async () => {
                const {dir} = repo(guideSource, false)

                const {stdout} = await runCommand(['run', 'rehearsal', 'table', '0', '--dry-run'])
                expect(stdout).to.contain('1/4')
                expect(selectCalls).to.equal(0)
                expect(fs.existsSync(path.join(dir, 'm1.txt'))).to.equal(false)
            })

            it('rejects --from abc through the shortcut', async () => {
                repo(guideSource)

                const result = await runHook(['rehearsal', '--from', 'abc'], 'rehearsal')
                expect(result.code).to.equal(1)
                expect(result.stderr).to.contain('--from must be a step number between 1 and 4')
            })

            it('rejects a bare trailing --from through the shortcut', async () => {
                repo(guideSource)

                const result = await runHook(['rehearsal', '--from'], 'rehearsal')
                expect(result.code).to.equal(1)
                expect(result.stderr).to.contain('--from must be a step number between 1 and 4')
            })

            it('rejects --from for an entry that is not a guide', async () => {
                repo(catalogSource())

                const result = await runHook(['make-file', '--from', '2'], 'make-file')
                expect(result.code).to.equal(1)
                expect(result.stderr).to.contain('--from only works with guides')
            })
        })

        it('prints catalog errors when the name is not found and xcute.yml is invalid', async () => {
            repo('entries: [oops', false)

            const {error, stderr} = await runCommand(['run', 'nope'])
            expect(error?.message).to.contain('Action "nope" not found')
            expect(stderr).to.contain('xcute.yml')
        })
    })
})
