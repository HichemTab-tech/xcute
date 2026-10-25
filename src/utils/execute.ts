import {walkGuide} from './guide.js'
import {ResolvedEntry} from './resolver.js'
import {runAction} from './runner.js'
import {ensureTrusted} from './trust-gate.js'

export interface ExecuteOptions {
    dryRun?: boolean
    from?: string
    interactive?: boolean
    log: (message: string) => void
    logError: (message: string) => void
    providedValues?: string[]
}

export async function executeEntry(resolved: ResolvedEntry, options: ExecuteOptions): Promise<number> {
    const {dryRun, from, interactive, log, logError, providedValues} = options

    if (resolved.source === 'personal') {
        if (from !== undefined) {
            logError('--from only works with guides')
            return 1
        }

        const ok = await runAction(resolved.action, {dryRun, interactive, log, logError, providedValues})
        return ok ? 0 : 1
    }

    const {catalog, entry} = resolved
    if (from !== undefined && entry.kind !== 'guide') {
        logError('--from only works with guides')
        return 1
    }

    if (!dryRun && !(await ensureTrusted(catalog, log))) return 1

    if (entry.kind === 'guide') {
        return walkGuide(entry, {
            catalogName: catalog.name,
            cwd: catalog.dir,
            dryRun,
            from: from === undefined ? undefined : (from.trim() === '' ? Number.NaN : Number(from)),
            interactive,
            log,
            logError,
            name: resolved.name,
            providedValues: providedValues ?? [],
            topicTitle: catalog.catalog?.topics.find((topic) => topic.id === entry.topic)?.title,
        })
    }

    const ok = await runAction(
        {commands: entry.commands, description: entry.description},
        {cwd: catalog.dir, dryRun, interactive, log, logError, providedValues},
    )
    return ok ? 0 : 1
}
