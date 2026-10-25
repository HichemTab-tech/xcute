import chalk from "chalk";
import {execa, execaCommand, ExecaError} from 'execa'

import {Action} from './config.js'
import {prompts} from "./prompts.js";
import {extractVariables, replaceAllVariables, VariableDefinition} from './variables.js'

export interface RunOptions {
    cwd?: string
    dryRun?: boolean
    interactive?: boolean
    log: (message: string) => void
    logError: (message: string) => void
    providedValues?: string[]
}

export type ResolvedValues = Record<string, {replacements: string[]; result: string}>

export interface ShellExecutionPlan {
    args?: string[]
    command: string
    shell?: true
}

export interface VariableResolutionPlan {
    promptDefault?: string
    shouldPrompt: boolean
    value?: string
}

export function createShellExecutionPlan(command: string, platform = process.platform, userShell = process.env.SHELL): ShellExecutionPlan {
    if (platform === 'win32') {
        return {command, shell: true}
    }

    const resolvedShell = userShell?.trim()

    if (!resolvedShell) {
        return {command, shell: true}
    }

    return {
        args: ['-i', '-c', command],
        command: resolvedShell,
    }
}

export function resolveVariableValue(variable: VariableDefinition, providedValue: string | undefined, interactive: boolean): VariableResolutionPlan {
    if (!interactive && providedValue !== undefined) {
        return {
            shouldPrompt: false,
            value: providedValue,
        }
    }

    if (!interactive && variable.defaultValue !== undefined) {
        return {
            shouldPrompt: false,
            value: variable.defaultValue,
        }
    }

    return {
        promptDefault: providedValue ?? variable.defaultValue,
        shouldPrompt: true,
    }
}

export async function resolveVariable(name: string, variable: VariableDefinition, providedValue: string | undefined, interactive: boolean): Promise<string> {
    const resolutionPlan = resolveVariableValue(variable, providedValue, interactive)

    if (!resolutionPlan.shouldPrompt) {
        return resolutionPlan.value ?? ''
    }

    return prompts.input({
        default: resolutionPlan.promptDefault || undefined,
        message: `${name}:${variable.description ? ` ${chalk.grey(`(${variable.description})`)}` : ""}`,
    })
}

export async function resolveVariables(variables: Map<string, VariableDefinition>, providedValues: string[], interactive: boolean): Promise<ResolvedValues> {
    const values: ResolvedValues = {}

    let i = 0
    for (const [key, variable] of variables.entries()) {
        values[key] = {
            replacements: variable.replacements,
            result: await resolveVariable(key, variable, providedValues[i], interactive),
        }
        i++
    }

    return values
}

export async function executeCommands(commands: string[], options: {cwd?: string; logError: (message: string) => void}): Promise<boolean> {
    const {cwd, logError} = options

    try {
        const executionPlan = createShellExecutionPlan(commands.join(' && '))

        await (executionPlan.args ? execa(executionPlan.command, executionPlan.args, {
                cwd,
                stdio: 'inherit',
            }) : execaCommand(executionPlan.command, {
                cwd,
                shell: executionPlan.shell ?? true,
                stdio: 'inherit',
            }));
    } catch (error: unknown) {
        if (error && error instanceof ExecaError && typeof error.exitCode === 'number') {
            logError(`Command failed with exit code ${error.exitCode}`)
        } else if (error instanceof Error) {
            logError(`Command failed: ${error.message}`)
        } else {
            logError('Command failed')
        }

        return false
    }

    return true
}

export async function runAction(action: Action, options: RunOptions): Promise<boolean> {
    const {cwd, dryRun = false, interactive = false, log, logError, providedValues = []} = options

    const variables = extractVariables(action.commands)
    const values = await resolveVariables(variables, providedValues, interactive)
    const resolvedCommands = replaceAllVariables(action.commands, values)

    log(`$ ${resolvedCommands.join(' && ')}`)

    if (dryRun) {
        return true
    }

    return executeCommands(resolvedCommands, {cwd, logError})
}
