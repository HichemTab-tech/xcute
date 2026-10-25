import * as fs from 'node:fs'
import * as path from 'node:path'

import type {Catalog, CatalogEntry} from './catalog-schema.js'

import {getConfigDir} from './config.js'
import {extractVariables, parseVariableToken, type VariableDefinition} from './variables.js'

export interface RunnableEntry {
    commands: string[][]
    kind: 'commands' | 'guide'
}

export type RunnableParts = Record<string, RunnableEntry>

export interface TrustChange {
    added: string[]
    label: string
    removed: string[]
    reordered: boolean
}

interface TrustRecord {
    runnable: RunnableParts
    trustedAt: string
}

export function entryVariables(entry: CatalogEntry): Map<string, VariableDefinition> {
    if (entry.kind === 'commands') {
        return extractVariables(entry.commands)
    }

    const texts: string[] = []
    for (const step of entry.steps) {
        texts.push(step.title)
        if (step.text !== undefined) texts.push(step.text)
        if (step.warn !== undefined) texts.push(step.warn)
        if (step.run) texts.push(...step.run)
        if (step.manual !== undefined) texts.push(step.manual)
        if (step.check !== undefined) texts.push(step.check)
    }

    return extractVariables(texts)
}

export function canonicalCommand(command: string, variables: Map<string, VariableDefinition>): string {
    return command.replaceAll(/\{\{([\S\s]*?)}}/g, (token, text: string) => {
        const {name} = parseVariableToken(text)
        if (!name) return token

        const defaultValue = variables.get(name)?.defaultValue
        return defaultValue === undefined ? `{{${name}}}` : `{{${name}|${defaultValue}}}`
    })
}

function runnableEntry(entry: CatalogEntry): RunnableEntry {
    const variables = entryVariables(entry)
    const canonical = (commands: string[]) => commands.map((c) => canonicalCommand(c, variables))

    if (entry.kind === 'commands') {
        return {commands: [canonical(entry.commands)], kind: 'commands'}
    }

    return {
        commands: entry.steps.filter((s) => s.kind === 'run').map((s) => canonical(s.run ?? [])),
        kind: 'guide',
    }
}

export function runnableParts(catalog: Catalog): RunnableParts {
    const parts: RunnableParts = {}
    for (const entry of catalog.entries) {
        Object.defineProperty(parts, entry.name, {
            configurable: true,
            enumerable: true,
            value: runnableEntry(entry),
            writable: true,
        })
    }

    return parts
}

export function sameRunnable(a: RunnableParts, b: RunnableParts): boolean {
    return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}

function sortKeys(parts: RunnableParts): [string, RunnableEntry][] {
    return Object.entries(parts).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
}

function own(parts: RunnableParts, name: string): RunnableEntry | undefined {
    return Object.hasOwn(parts, name) ? parts[name] : undefined
}

function multisetDifference(from: string[], minus: string[]): string[] {
    const counts = new Map<string, number>()
    for (const line of minus) counts.set(line, (counts.get(line) ?? 0) + 1)
    return from.filter((line) => {
        const left = counts.get(line) ?? 0
        if (left === 0) return true
        counts.set(line, left - 1)
        return false
    })
}

function lineChange(label: string, before: string[], after: string[]): TrustChange | undefined {
    if (JSON.stringify(before) === JSON.stringify(after)) return undefined

    const added = multisetDifference(after, before)
    const removed = multisetDifference(before, after)
    return {added, label, removed, reordered: added.length === 0 && removed.length === 0}
}

function diffGuideSteps(name: string, old: RunnableEntry, current: RunnableEntry, catalog: Catalog): TrustChange[] {
    const entry = catalog.entries.find((e) => e.name === name)
    const titles = entry?.kind === 'guide' ? entry.steps.filter((s) => s.kind === 'run').map((s) => s.title) : []
    const changes: TrustChange[] = []
    const count = Math.max(old.commands.length, current.commands.length)
    for (let k = 0; k < count; k++) {
        const label = `${name} › ${titles[k] ?? `run step ${k + 1}`}`
        const change = lineChange(label, old.commands[k] ?? [], current.commands[k] ?? [])
        if (change) {
            changes.push(change)
        } else if (!old.commands[k] || !current.commands[k]) {
            changes.push({added: [], label, removed: [], reordered: false})
        }
    }

    return changes
}

export function diffRunnable(before: RunnableParts, after: RunnableParts, catalog: Catalog): TrustChange[] {
    const changes: TrustChange[] = []
    const names = [...new Set([...Object.keys(after), ...Object.keys(before)])]

    for (const name of names) {
        const old = own(before, name)
        const current = own(after, name)
        const oldLines = old ? old.commands.flat() : []
        const newLines = current ? current.commands.flat() : []

        if (!old || !current || old.kind !== current.kind || current.kind === 'commands') {
            const kindChanged = Boolean(old && current && old.kind !== current.kind)
            const change = lineChange(name, oldLines, newLines)
            if (change) {
                changes.push(change)
            } else if (!old || !current || kindChanged) {
                changes.push({added: [], label: name, removed: [], reordered: false})
            }

            continue
        }

        changes.push(...diffGuideSteps(name, old, current, catalog))
    }

    return changes
}

export function countCommands(parts: RunnableParts): number {
    return Object.values(parts).reduce((total, entry) => total + entry.commands.flat().length, 0)
}

export function getTrustFile(): string {
    return path.join(getConfigDir(), 'trust.json')
}

function catalogKey(catalogFile: string): string {
    try {
        return fs.realpathSync(catalogFile)
    } catch {
        return path.resolve(catalogFile)
    }
}

function readStore(): Record<string, TrustRecord> {
    try {
        const data: unknown = JSON.parse(fs.readFileSync(getTrustFile(), 'utf8'))
        return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, TrustRecord>) : {}
    } catch {
        return {}
    }
}

function writeStore(store: Record<string, TrustRecord>): void {
    fs.mkdirSync(path.dirname(getTrustFile()), {recursive: true})
    fs.writeFileSync(getTrustFile(), JSON.stringify(store, null, 2))
}

export function readTrust(catalogFile: string): RunnableParts | undefined {
    const record = readStore()[catalogKey(catalogFile)]
    const runnable = record?.runnable
    return runnable && typeof runnable === 'object' && !Array.isArray(runnable) ? runnable : undefined
}

export function writeTrust(catalogFile: string, parts: RunnableParts): void {
    const store = readStore()
    store[catalogKey(catalogFile)] = {runnable: parts, trustedAt: new Date().toISOString()}
    writeStore(store)
}

export function revokeTrust(catalogFile: string): boolean {
    const store = readStore()
    const key = catalogKey(catalogFile)
    if (!(key in store)) return false

    delete store[key]
    writeStore(store)
    return true
}
