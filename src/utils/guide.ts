import type {GuideEntry, GuideStep} from './catalog-schema.js'
import type {ResolvedEntry} from './resolver.js'

import {prompts} from './prompts.js'
import {executeCommands, resolveVariable} from './runner.js'
import {entryVariables} from './trust.js'
import {extractVariables, parseVariableToken, VARIABLE_PATTERN, type VariableDefinition} from './variables.js'

export function guideVariables(entry: GuideEntry): Map<string, VariableDefinition> {
    return entryVariables(entry)
}

function stepTexts(step: GuideStep): string[] {
    const texts = [step.title]
    if (step.text !== undefined) texts.push(step.text)
    if (step.warn !== undefined) texts.push(step.warn)
    if (step.run) texts.push(...step.run)
    if (step.manual !== undefined) texts.push(step.manual)
    if (step.check !== undefined) texts.push(step.check)
    return texts
}

export function stepVariables(step: GuideStep): string[] {
    return [...extractVariables(stepTexts(step)).keys()]
}

export function fillPlaceholders(
    text: string,
    variables: Map<string, VariableDefinition>,
    values: Record<string, string>,
): string {
    return text.replaceAll(VARIABLE_PATTERN, (token, inner: string) => {
        const {name} = parseVariableToken(inner)
        if (!name) return token
        return values[name] ?? variables.get(name)?.defaultValue ?? `<${name}>`
    })
}

export function shellQuote(value: string): string {
    if (/^[\w%+,./:=@-]+$/.test(value)) return value
    return `'${value.replaceAll("'", String.raw`'\''`)}'`
}

export function resumeHint(name: string, values: string[], step: number): string {
    return `Stopped at step ${step}. Pick up with: xcute ${[name, ...values.map((v) => shellQuote(v))].join(' ')} --from ${step}`
}

export function renderEntry(resolved: ResolvedEntry, providedValues: string[]): string[] {
    const lines: string[] = []

    if (resolved.source === 'personal') {
        const {action, name} = resolved
        const variables = extractVariables(action.commands)
        const values = mapValues(variables, providedValues)
        lines.push(name)
        if (action.description) lines.push(action.description)
        lines.push('', ...action.commands.map((c) => `$ ${fillPlaceholders(c, variables, values)}`))
        return lines
    }

    const {catalog, entry, name} = resolved
    const variables = entry.kind === 'guide' ? guideVariables(entry) : entryVariables(entry)
    const values = mapValues(variables, providedValues)
    const fill = (text: string) => fillPlaceholders(text, variables, values)

    lines.push(name, entry.description)
    const topicTitle = catalog.catalog?.topics.find((t) => t.id === entry.topic)?.title
    lines.push([catalog.catalog?.name ?? catalog.name, topicTitle].filter(Boolean).join(' · '))
    if (entry.docs) lines.push(`docs ${entry.docs}`)

    if (entry.kind === 'commands') {
        lines.push('', ...entry.commands.map((c) => `$ ${fill(c)}`))
        return lines
    }

    for (const [index, step] of entry.steps.entries()) {
        const suffix = step.kind === 'manual' ? '  by hand' : step.kind === 'check' ? '  check' : ''
        lines.push('', `${index + 1}. ${fill(step.title)}${suffix}`)
        if (step.text !== undefined) lines.push(`   ${fill(step.text)}`)
        if (step.warn !== undefined) lines.push(`   ⚠ ${fill(step.warn)}`)
        for (const command of step.run ?? []) lines.push(`   $ ${fill(command)}`)
        if (step.manual !== undefined) lines.push(`   ${fill(step.manual)}`)
        if (step.check !== undefined) lines.push(`   ${fill(step.check)}`)
    }

    lines.push('', `Closed the terminal partway? Pick up again: xcute ${name} [values] --from <n>`)
    return lines
}

function mapValues(variables: Map<string, VariableDefinition>, provided: string[]): Record<string, string> {
    const values: Record<string, string> = {}
    for (const [index, name] of [...variables.keys()].entries()) {
        if (index < provided.length) values[name] = provided[index]
    }

    return values
}

export interface WalkOptions {
    catalogName?: string
    cwd: string
    dryRun?: boolean
    from?: number
    interactive?: boolean
    log: (message: string) => void
    logError: (message: string) => void
    name: string
    providedValues: string[]
    topicTitle?: string
}

const KIND_LABELS = {check: 'check', manual: 'by hand', run: 'run'} as const

function isPromptInterrupt(error: unknown): boolean {
    return error instanceof Error && error.name === 'ExitPromptError'
}

async function choose(message: string, choices: Array<[string, string]>): Promise<string> {
    return prompts.select({choices: choices.map(([value, name]) => ({name, value})), message})
}

// Returns an exit code when the user stops at this step, undefined to go on.
async function runStep(
    step: GuideStep,
    fill: (text: string) => string,
    context: {cwd: string; dryRun: boolean; log: (message: string) => void; logError: (message: string) => void},
): Promise<number | undefined> {
    const {cwd, dryRun, log, logError} = context

    if (step.kind === 'manual') {
        if (step.manual !== undefined) log(fill(step.manual))
        if (dryRun) return undefined
        const answer = await choose('Step done?', [['continue', 'Done, continue'], ['stop', 'Stop here']])
        return answer === 'stop' ? 0 : undefined
    }

    if (step.kind === 'check') {
        if (step.check !== undefined) log(fill(step.check))
        if (dryRun) return undefined
        const answer = await choose('Does it look right?', [['continue', 'Looks right, continue'], ['stop', "Something's wrong, stop"]])
        return answer === 'stop' ? 1 : undefined
    }

    const commands = (step.run ?? []).map((command) => fill(command))
    for (const command of commands) log(`$ ${command}`)
    if (dryRun) return undefined
    const answer = await choose('Run this step?', [['run', 'Run'], ['skip', 'Skip'], ['stop', 'Stop']])
    if (answer === 'stop') return 0
    if (answer === 'skip') return undefined

    while (!(await executeCommands(commands, {cwd, logError}))) {
         
        const next = await choose('The command failed. What now?', [['retry', 'Retry'], ['skip', 'Skip'], ['stop', 'Stop']])
        if (next === 'stop') return 1
        if (next === 'skip') break
    }

    return undefined
}

export async function walkGuide(entry: GuideEntry, options: WalkOptions): Promise<number> {
    const {catalogName, cwd, dryRun = false, from = 1, interactive = false, log, logError, name, providedValues, topicTitle} = options
    const total = entry.steps.length

    if (!Number.isInteger(from) || from < 1 || from > total) {
        logError(`--from must be a step number between 1 and ${total}`)
        return 1
    }

    const variables = guideVariables(entry)
    const variableNames = [...variables.keys()]
    const values: Record<string, string> = {}
    const fill = (text: string) => fillPlaceholders(text, variables, values)

    const knownValues = (): string[] => {
        const known: string[] = []
        for (const variableName of variableNames) {
            if (values[variableName] === undefined) break
            known.push(values[variableName])
        }

        return known
    }

    log(entry.name === name ? name : `${name} (${entry.name})`)
    log(entry.description)
    const origin = [catalogName, topicTitle].filter(Boolean).join(' · ')
    if (origin) log(origin)
    log(`${total} ${total === 1 ? 'step' : 'steps'}`)
    if (entry.docs) log(`docs ${entry.docs}`)

    let stepNumber = from
    try {
        for (; stepNumber <= total; stepNumber++) {
            const step = entry.steps[stepNumber - 1]
            const stop = (code: number): number => {
                log(resumeHint(name, knownValues(), stepNumber))
                return code
            }

            for (const variableName of stepVariables(step)) {
                if (values[variableName] !== undefined) continue
                 
                values[variableName] = await resolveVariable(
                    variableName,
                    variables.get(variableName)!,
                    providedValues[variableNames.indexOf(variableName)],
                    interactive,
                )
            }

            log('')
            log(`── ${stepNumber}/${total}  ${fill(step.title)} [${KIND_LABELS[step.kind]}]`)
            if (step.text !== undefined) log(fill(step.text))
            if (step.warn !== undefined) log(`⚠ ${fill(step.warn)}`)

             
            const stopCode = await runStep(step, fill, {cwd, dryRun, log, logError})
            if (stopCode !== undefined) return stop(stopCode)
        }
    } catch (error) {
        if (!isPromptInterrupt(error)) throw error
        log('')
        log(resumeHint(name, knownValues(), stepNumber))
        return 1
    }

    log('')
    log(dryRun ? 'Dry run finished. Nothing was executed.' : 'Guide done.')
    return 0
}
