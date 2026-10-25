import {Separator} from '@inquirer/prompts'

import type {Catalog, CatalogEntry} from './catalog-schema.js'
import type {LoadedCatalog} from './catalog.js'
import type {Action, ConfigData} from './config.js'
import type {ResolvedEntry} from './resolver.js'

export function matchesTerm(term: string | undefined, ...fields: (string | undefined)[]): boolean {
    const words = (term ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return true
    const haystack = fields.filter((field): field is string => field !== undefined).map((field) => field.toLowerCase())
    return words.every((word) => haystack.some((field) => field.includes(word)))
}

export type PickerValue =
    | {kind: 'back'}
    | {kind: 'entry'; resolved: ResolvedEntry}
    | {kind: 'personal-topic'}
    | {kind: 'topic'; topicId: null | string}

export interface PickerChoice {
    description?: string
    name: string
    value: PickerValue
}

export interface PickerModel {
    catalog?: LoadedCatalog
    personal: ConfigData
}

const PERSONAL_TITLE = 'Your actions'
const OTHER_TITLE = 'Other'

const NOUNS: Record<string, [string, string]> = {
    action: ['action', 'actions'],
    entry: ['entry', 'entries'],
    topic: ['topic', 'topics'],
}

function plural(count: number, noun: keyof typeof NOUNS): string {
    return `${count} ${NOUNS[noun][count === 1 ? 0 : 1]}`
}

function catalogOf(model: PickerModel): Catalog | undefined {
    return model.catalog?.catalog
}

function knownTopicIds(catalog: Catalog): Set<string> {
    return new Set(catalog.topics.map((topic) => topic.id))
}

function entriesOfTopic(catalog: Catalog, topicId: null | string): CatalogEntry[] {
    if (topicId === null) {
        const known = knownTopicIds(catalog)
        return catalog.entries.filter((entry) => !entry.topic || !known.has(entry.topic))
    }

    return catalog.entries.filter((entry) => entry.topic === topicId)
}

function catalogChoice(loaded: LoadedCatalog, entry: CatalogEntry, name: string): PickerChoice {
    const first = entry.kind === 'commands' ? entry.commands[0] : undefined
    return {
        description: first === undefined ? entry.description : `${entry.description}  $ ${first}`,
        name: entry.kind === 'guide' ? `${name}  guide` : name,
        value: {kind: 'entry', resolved: {catalog: loaded, entry, name: entry.name, source: 'project'}},
    }
}

function personalChoice(name: string, action: Action, label: string): PickerChoice {
    const first = action.commands[0]
    const parts = [action.description, first === undefined ? undefined : `$ ${first}`].filter(Boolean)
    return {
        description: parts.length > 0 ? parts.join('  ') : undefined,
        name: label,
        value: {kind: 'entry', resolved: {action, name, source: 'personal'}},
    }
}

export function pickerHeader(model: PickerModel): string {
    const catalog = catalogOf(model)
    const name = model.catalog?.name ?? ''
    return `${name} · ${plural(catalog?.entries.length ?? 0, 'entry')} in ${plural(catalog?.topics.length ?? 0, 'topic')} · ${Object.keys(model.personal).length} of your actions`
}

export function topicChoices(model: PickerModel): Array<PickerChoice | Separator> {
    const catalog = catalogOf(model)
    const groups: Array<{count: number; summary?: string; title: string; topicId: null | string}> = []
    if (catalog) {
        for (const topic of catalog.topics) {
            groups.push({count: entriesOfTopic(catalog, topic.id).length, summary: topic.summary, title: topic.title, topicId: topic.id})
        }

        groups.push({count: entriesOfTopic(catalog, null).length, title: OTHER_TITLE, topicId: null})
    }

    const shown = groups.filter((group) => group.count > 0)
    const width = Math.max(0, ...shown.map((group) => group.title.length))
    const choices: Array<PickerChoice | Separator> = shown.map((group) => ({
        name: [group.title.padEnd(width), group.summary, `(${plural(group.count, 'entry')})`].filter(Boolean).join('  '),
        value: {kind: 'topic', topicId: group.topicId},
    }))

    const personalCount = Object.keys(model.personal).length
    if (personalCount > 0) {
        if (choices.length > 0) choices.push(new Separator())
        choices.push({
            name: `${PERSONAL_TITLE.padEnd(width)}  (${plural(personalCount, 'action')})`,
            value: {kind: 'personal-topic'},
        })
    }

    return choices
}

export function topicEntryChoices(model: PickerModel, topic: Exclude<PickerValue, {kind: 'back' | 'entry'}>): PickerChoice[] {
    const back: PickerChoice = {name: '← Back to topics', value: {kind: 'back'}}
    const catalog = catalogOf(model)
    if (topic.kind === 'personal-topic') {
        return [back, ...Object.entries(model.personal).map(([name, action]) => personalChoice(name, action, name))]
    }

    if (!catalog || !model.catalog) return [back]
    const loaded = model.catalog
    return [back, ...entriesOfTopic(catalog, topic.topicId).map((entry) => catalogChoice(loaded, entry, entry.name))]
}

export function searchChoices(model: PickerModel, term: string): PickerChoice[] {
    const catalog = catalogOf(model)
    const choices: PickerChoice[] = []
    if (catalog && model.catalog) {
        const loaded = model.catalog
        for (const entry of catalog.entries) {
            if (!matchesTerm(term, entry.name, entry.description)) continue
            const title = catalog.topics.find((topic) => topic.id === entry.topic)?.title ?? OTHER_TITLE
            choices.push(catalogChoice(loaded, entry, `${title} › ${entry.name}`))
        }
    }

    for (const [name, action] of Object.entries(model.personal)) {
        if (!matchesTerm(term, name, action.description)) continue
        choices.push(personalChoice(name, action, catalog ? `${PERSONAL_TITLE} › ${name}` : name))
    }

    return choices
}
