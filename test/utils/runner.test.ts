import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {prompts} from '../../src/utils/prompts.js'
import {createShellExecutionPlan, executeCommands, resolveVariable, resolveVariableValue, runAction} from '../../src/utils/runner.js'

describe('runner', () => {
    it('uses the interactive user shell on unix-like systems', () => {
        const executionPlan = createShellExecutionPlan('xcute hello', 'linux', '/bin/zsh')

        expect(executionPlan).to.deep.equal({
            command: '/bin/zsh',
            args: ['-i', '-c', 'xcute hello'],
        })
    })

    it('falls back to the default shell when no user shell is available', () => {
        const executionPlan = createShellExecutionPlan('xcute hello', 'linux', '')

        expect(executionPlan).to.deep.equal({
            command: 'xcute hello',
            shell: true,
        })
    })

    it('keeps the default shell execution on windows', () => {
        const executionPlan = createShellExecutionPlan('xcute hello', 'win32', '/bin/zsh')

        expect(executionPlan).to.deep.equal({
            command: 'xcute hello',
            shell: true,
        })
    })

    it('uses the provided value directly in non-interactive mode', () => {
        const resolution = resolveVariableValue({
            defaultValue: 'fallback',
            description: 'Project name',
            replacements: ['name::Project name|fallback'],
        }, 'from-argv', false)

        expect(resolution).to.deep.equal({
            shouldPrompt: false,
            value: 'from-argv',
        })
    })

    it('uses the variable default directly in non-interactive mode', () => {
        const resolution = resolveVariableValue({
            defaultValue: 'fallback',
            description: 'Project name',
            replacements: ['name::Project name|fallback'],
        }, undefined, false)

        expect(resolution).to.deep.equal({
            shouldPrompt: false,
            value: 'fallback',
        })
    })

    it('prefills the prompt with the default in interactive mode', () => {
        const resolution = resolveVariableValue({
            defaultValue: 'fallback',
            description: 'Project name',
            replacements: ['name::Project name|fallback'],
        }, undefined, true)

        expect(resolution).to.deep.equal({
            promptDefault: 'fallback',
            shouldPrompt: true,
        })
    })

    describe('reuse helpers', () => {
        let origInput: typeof prompts.input

        beforeEach(() => {
            origInput = prompts.input
        })

        afterEach(() => {
            prompts.input = origInput
        })

        it('runs commands in the given cwd', async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcute-cwd-'))
            const ok = await executeCommands([`node -e "require('node:fs').writeFileSync('cwd.txt', process.cwd())"`], {cwd: dir, logError() {}})
            expect(ok).to.equal(true)
            expect(fs.readFileSync(path.join(dir, 'cwd.txt'), 'utf8')).to.equal(fs.realpathSync(dir))
        })

        it('returns false and reports the exit code when a command fails', async () => {
            const errors: string[] = []
            const ok = await executeCommands(['exit 3'], {logError: (m) => errors.push(m)})
            expect(ok).to.equal(false)
            expect(errors).to.deep.equal(['Command failed with exit code 3'])
        })

        it('logs $ replacement patterns in defaults and provided values literally', async () => {
            const logged: string[] = []
            const ok = await runAction(
                {commands: ["echo {{name}} [{{greeting|$'}}] ; touch PWNED ;'"]},
                {dryRun: true, log: (m) => logged.push(m), logError() {}, providedValues: ['$&$$']},
            )
            expect(ok).to.equal(true)
            expect(logged).to.deep.equal(["$ echo $&$$ [$'] ; touch PWNED ;'"])
        })

        it('resolveVariable returns the provided value without prompting', async () => {
            prompts.input = (async () => {
                throw new Error('should not prompt')
            }) as typeof prompts.input
            const value = await resolveVariable('name', {replacements: ['x']}, 'given', false)
            expect(value).to.equal('given')
        })

        it('resolveVariable prompts with the default prefilled in interactive mode', async () => {
            let received: {default?: string; message: string} | undefined
            prompts.input = (async (options: {default?: string; message: string}) => {
                received = options
                return 'typed'
            }) as typeof prompts.input
            const value = await resolveVariable('name', {defaultValue: 'fallback', replacements: ['x']}, undefined, true)
            expect(value).to.equal('typed')
            expect(received?.default).to.equal('fallback')
            expect(received?.message).to.equal('name:')
        })
    })
})
