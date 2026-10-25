import type {GuideEntry, GuideStep} from './catalog-schema.js'
import type {ResolvedEntry} from './resolver.js'

import {entryVariables} from './trust.js'
import {extractVariables, parseVariableToken, type VariableDefinition} from './variables.js'

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
    return text.replaceAll(/\{\{([\S\s]*?)}}/g, (token, inner: string) => {
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
