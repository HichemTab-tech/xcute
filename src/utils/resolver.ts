import type {CatalogEntry} from './catalog-schema.js'
import type {LoadedCatalog} from './catalog.js'

import {Action, actionExists, getAction} from './config.js'

export type ResolvedEntry =
    | {action: Action; name: string; source: 'personal'}
    | {catalog: LoadedCatalog; entry: CatalogEntry; name: string; source: 'project'}

export function isShadowed(name: string): boolean {
    return actionExists(name)
}

export function resolveEntry(name: string, loaded: LoadedCatalog | undefined, projectOnly = false): ResolvedEntry | undefined {
    if (!projectOnly) {
        const action = getAction(name)
        if (action) return {action, name, source: 'personal'}
    }

    const entry = loaded?.catalog?.entries.find((candidate) => candidate.name === name)
    if (loaded && entry) return {catalog: loaded, entry, name, source: 'project'}
    return undefined
}
