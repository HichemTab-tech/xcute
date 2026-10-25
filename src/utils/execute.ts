import {checkFromStep, walkGuide} from './guide.js'
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

// An empty or non-numeric --from becomes NaN, which the step range check rejects.
function parseFrom(from: string | undefined): number | undefined {
    if (from === undefined) return undefined
    return from.trim() === '' ? Number.NaN : Number(from)
}

export async function executeEntry(resolved: ResolvedEntry, options: ExecuteOptions): Promise<number> {
    const {dryRun, interactive, log, logError, providedValues} = options
    const from = parseFrom(options.from)

    if (from !== undefined) {
        if (resolved.source === 'personal' || resolved.entry.kind !== 'guide') {
            logError('--from only works with guides')
            return 1
        }

        // Checked before the trust gate, so a mistyped --from never asks for trust first.
        const fromError = checkFromStep(from, resolved.entry.steps.length)
        if (fromError) {
            logError(fromError)
            return 1
        }
    }

    if (resolved.source === 'personal') {
        const ok = await runAction(resolved.action, {dryRun, interactive, log, logError, providedValues})
        return ok ? 0 : 1
    }

    const {catalog, entry} = resolved
    if (!dryRun && !(await ensureTrusted(catalog, log))) return 1

    if (entry.kind === 'guide') {
        return walkGuide(entry, {
            catalogName: catalog.name,
            cwd: catalog.dir,
            dryRun,
            from,
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
