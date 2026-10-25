import type {LoadedCatalog} from './catalog.js'

import {prompts, terminal} from './prompts.js'
import {
    countCommands,
    diffRunnable,
    readTrust,
    runnableParts,
    type RunnableParts,
    sameRunnable,
    type TrustChange,
    writeTrust,
} from './trust.js'

export function formatTrustChanges(changes: TrustChange[]): string[] {
    const lines: string[] = []
    for (const change of changes) {
        lines.push(`  ${change.label}`)
        for (const command of change.removed) lines.push(`-   ${command}`)
        for (const command of change.added) lines.push(`+   ${command}`)
        if (change.reordered) lines.push('    (order changed)')
        else if (change.added.length === 0 && change.removed.length === 0) lines.push('    (entry type changed)')
    }

    return lines
}

function logAllCommands(parts: RunnableParts, log: (message: string) => void): void {
    for (const [name, entry] of Object.entries(parts)) {
        log(`  ${name}`)
        for (const command of entry.commands.flat()) log(`      ${command}`)
    }
}

export async function ensureTrusted(loaded: LoadedCatalog, log: (message: string) => void): Promise<boolean> {
    if (!loaded.catalog) return false

    const current = runnableParts(loaded.catalog)
    const stored = readTrust(loaded.file)
    if (stored && sameRunnable(stored, current)) return true

    if (!terminal.isInteractive()) {
        log(`Run "xcute trust" in ${loaded.dir} to trust ${loaded.file}.`)
        return false
    }

    if (stored) {
        log(`${loaded.file} changed since you trusted it:`)
        log('')
        for (const line of formatTrustChanges(diffRunnable(stored, current, loaded.catalog))) log(line)
        log('')
        const answer = await prompts.select({
            choices: [
                {name: 'Trust', value: 'trust'},
                {name: 'Cancel', value: 'cancel'},
            ],
            message: 'Trust these changes and continue?',
        })
        if (answer !== 'trust') return false
    } else {
        log(`This catalog has not been trusted: ${loaded.file}`)
        log(`${Object.keys(current).length} entries, ${countCommands(current)} commands`)
        for (;;) {
            const answer = await prompts.select({
                choices: [
                    {name: 'Show all commands', value: 'show'},
                    {name: 'Trust', value: 'trust'},
                    {name: 'Cancel', value: 'cancel'},
                ],
                message: 'Trust this catalog?',
            })
            if (answer === 'show') {
                logAllCommands(current, log)
                continue
            }

            if (answer !== 'trust') return false
            break
        }
    }

    writeTrust(loaded.file, current)
    return true
}
