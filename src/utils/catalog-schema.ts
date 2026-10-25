import {isMap, isScalar, isSeq, LineCounter, parseDocument} from 'yaml'

export type StepKind = 'check' | 'manual' | 'run'

export interface GuideStep {
    check?: string
    kind: StepKind
    manual?: string
    run?: string[]
    text?: string
    title: string
    warn?: string
}

export interface CatalogTopic {
    id: string
    summary?: string
    title: string
}

interface EntryBase {
    description: string
    docs?: string
    name: string
    topic?: string
}

export interface CommandEntry extends EntryBase {
    commands: string[]
    kind: 'commands'
}

export interface GuideEntry extends EntryBase {
    kind: 'guide'
    steps: GuideStep[]
}

export type CatalogEntry = CommandEntry | GuideEntry

export interface Catalog {
    entries: CatalogEntry[]
    name?: string
    topics: CatalogTopic[]
}

export interface CatalogError {
    line?: number
    message: string
}

const TOP_KEYS = ['version', 'name', 'topics', 'entries']
const TOPIC_KEYS = ['title', 'summary']
const ENTRY_KEYS = ['topic', 'description', 'docs', 'commands', 'steps']
const STEP_KEYS = ['title', 'text', 'warn', 'run', 'manual', 'check']
const QUOTE_HINT = 'a value starting with {{ must be quoted'

export function formatCatalogError(file: string, error: CatalogError): string {
    return error.line === undefined ? `${file}: ${error.message}` : `${file}:${error.line}: ${error.message}`
}

export function parseCatalog(source: string): {catalog?: Catalog; errors: CatalogError[]} {
    const lineCounter = new LineCounter()
    const doc = parseDocument(source, {lineCounter})
    const errors: CatalogError[] = []

    const lineOf = (node: unknown): number | undefined => {
        const range = (node as null | {range?: null | number[]})?.range
        return range ? lineCounter.linePos(range[0]).line : undefined
    }

    const fail = (node: unknown, message: string): void => {
        errors.push({line: lineOf(node), message})
    }

    if (doc.errors.length > 0) {
        for (const err of doc.errors) {
            errors.push({line: lineCounter.linePos(err.pos[0]).line, message: err.message.split('\n')[0]})
        }

        return {errors}
    }

    // A plain string field; reports a quoting hint when `{{...}}` parsed as a flow mapping.
    const readString = (node: unknown, where: string, field: string): string | undefined => {
        if (isScalar(node) && typeof node.value === 'string') return node.value
        if (isMap(node) && node.flow) {
            fail(node, `${where}${field} looks like a mapping; ${QUOTE_HINT}`)
        } else {
            fail(node, `${where}${field} must be a string`)
        }

        return undefined
    }

    // Walks a mapping's pairs, rejecting unknown keys; returns the value node by key name.
    const readKeys = (node: unknown, allowed: string[], where: string): Map<string, {key: unknown; value: unknown}> | undefined => {
        if (!isMap(node)) {
            fail(node, `${where.replace(/: $/, '')} must be a mapping`)
            return undefined
        }

        const found = new Map<string, {key: unknown; value: unknown}>()
        for (const pair of node.items) {
            const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key)
            if (allowed.includes(key)) {
                found.set(key, {key: pair.key, value: pair.value})
            } else {
                fail(pair.key, `${where}unknown key "${key}"`)
            }
        }

        return found
    }

    const optionalString = (
        fields: Map<string, {key: unknown; value: unknown}>,
        field: string,
        where: string,
    ): string | undefined => {
        const f = fields.get(field)
        return f ? readString(f.value, where, field) : undefined
    }

    const readStringList = (node: unknown, where: string, field: string, allowScalar: boolean): string[] | undefined => {
        if (isSeq(node)) {
            if (node.items.length === 0) {
                fail(node, `${where}${field} must not be empty`)
                return undefined
            }

            const out: string[] = []
            let ok = true
            for (const item of node.items) {
                const s = readString(item, where, `${field} item`)
                if (s === undefined) ok = false
                else out.push(s)
            }

            return ok ? out : undefined
        }

        if (allowScalar) {
            const s = readString(node, where, field)
            return s === undefined ? undefined : [s]
        }

        fail(node, `${where}${field} must be a list`)
        return undefined
    }

    const readStep = (node: unknown, entryName: string, index: number): GuideStep | undefined => {
        const where = `entry "${entryName}", step ${index + 1}: `
        const before = errors.length
        const fields = readKeys(node, STEP_KEYS, where)
        if (!fields) return undefined

        const titleField = fields.get('title')
        const title = titleField ? readString(titleField.value, where, 'title') : undefined
        if (!titleField) fail(node, `${where}title is required`)

        const text = optionalString(fields, 'text', where)
        const warn = optionalString(fields, 'warn', where)

        const kinds = (['run', 'manual', 'check'] as const).filter((k) => fields.has(k))
        let step: Partial<GuideStep> = {}
        if (kinds.length === 1) {
            const kind = kinds[0]
            const {value} = (fields.get(kind)!)
            if (kind === 'run') {
                const run = readStringList(value, where, 'run', true)
                step = {kind, run}
            } else {
                step = {[kind]: readString(value, where, kind), kind}
            }
        } else {
            fail(node, `${where}use exactly one of run, manual or check`)
        }

        if (errors.length > before || title === undefined) return undefined
        return {...step, text, title, warn} as GuideStep
    }

    const readEntry = (name: string, keyNode: unknown, node: unknown, topicIds: Set<string>): CatalogEntry | undefined => {
        const where = `entry "${name}": `
        const before = errors.length
        if (name === '__proto__') {
            fail(keyNode, `${where}this name is reserved`)
            return undefined
        }

        const fields = readKeys(node, ENTRY_KEYS, where)
        if (!fields) return undefined

        const description = optionalString(fields, 'description', where)
        if (!fields.has('description')) fail(keyNode, `${where}description is required`)
        const docs = optionalString(fields, 'docs', where)

        let topic: string | undefined
        const topicField = fields.get('topic')
        if (topicField) {
            topic = readString(topicField.value, where, 'topic')
            if (topic !== undefined && !topicIds.has(topic)) {
                fail(topicField.value, `${where}topic "${topic}" is not declared`)
            }
        }

        const commandsField = fields.get('commands')
        const stepsField = fields.get('steps')
        let commands: string[] | undefined
        let steps: GuideStep[] | undefined
        if (commandsField && stepsField) {
            fail(keyNode, `${where}use either commands or steps`)
        } else if (commandsField) {
            commands = readStringList(commandsField.value, where, 'commands', false)
        } else if (stepsField) {
            const list = stepsField.value
            if (!isSeq(list)) {
                fail(list, `${where}steps must be a list`)
            } else if (list.items.length === 0) {
                fail(list, `${where}steps must not be empty`)
            } else {
                steps = []
                for (const [i, item] of list.items.entries()) {
                    const step = readStep(item, name, i)
                    if (step) steps.push(step)
                }
            }
        } else {
            fail(keyNode, `${where}use either commands or steps`)
        }

        if (errors.length > before || description === undefined) return undefined
        const base = {description, docs, name, topic}
        if (commands) return {...base, commands, kind: 'commands'}
        return {...base, kind: 'guide', steps: steps!}
    }

    const root = doc.contents
    if (root === null || root === undefined) {
        errors.push({line: 1, message: 'entries is required'})
        return {errors}
    }

    const top = readKeys(root, TOP_KEYS, '')
    if (!top) return {errors}

    const version = top.get('version')
    if (version && !(isScalar(version.value) && version.value.value === 1)) {
        fail(version.value, 'version must be 1')
    }

    const name = optionalString(top, 'name', '')

    const topicsField = top.get('topics')
    const readTopics = (): CatalogTopic[] => {
        const topics: CatalogTopic[] = []
        if (!topicsField) return topics
        if (!isMap(topicsField.value)) {
            fail(topicsField.value, 'topics must be a mapping')
            return topics
        }

        for (const pair of topicsField.value.items) {
            const id = String((pair.key as {value?: unknown})?.value ?? pair.key)
            const where = `topic "${id}": `
            const fields = readKeys(pair.value, TOPIC_KEYS, where)
            if (!fields) continue
            const titleField = fields.get('title')
            const title = titleField ? readString(titleField.value, where, 'title') : undefined
            if (!titleField) fail(pair.key, `${where}title is required`)
            const summary = optionalString(fields, 'summary', where)
            if (title !== undefined) topics.push({id, summary, title})
        }

        return topics
    }

    const topics = readTopics()
    // Declared ids count even when the topic itself is invalid, so entries do not report a second, misleading error.
    const topicIds = new Set(topics.map((t) => t.id))
    if (isMap(topicsField?.value)) {
        for (const pair of topicsField.value.items) topicIds.add(String((pair.key as {value?: unknown})?.value ?? pair.key))
    }

    const readEntries = (): CatalogEntry[] => {
        const entries: CatalogEntry[] = []
        const entriesField = top.get('entries')
        if (!entriesField) {
            fail(root, 'entries is required')
        } else if (isMap(entriesField.value)) {
            if (entriesField.value.items.length === 0) fail(entriesField.value, 'entries must not be empty')
            for (const pair of entriesField.value.items) {
                const entryName = String((pair.key as {value?: unknown})?.value ?? pair.key)
                const entry = readEntry(entryName, pair.key, pair.value, topicIds)
                if (entry) entries.push(entry)
            }
        } else {
            fail(entriesField.value, 'entries must be a mapping')
        }

        return entries
    }

    const entries = readEntries()

    if (errors.length > 0) return {errors}
    return {catalog: {entries, name, topics}, errors}
}
