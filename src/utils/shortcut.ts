export interface ShortcutArgs {
    dryRun: boolean
    from?: string
    interactive: boolean
    project: boolean
    values: string[]
}

export function parseShortcutArgs(args: string[]): ShortcutArgs {
    const parsed: ShortcutArgs = {dryRun: false, interactive: false, project: false, values: []}
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        switch (arg) {
            case '--dry-run':
            case '-d': {
                parsed.dryRun = true
                break
            }

            case '--from': {
                parsed.from = i + 1 < args.length ? args[++i] : ''
                break
            }

            case '--interactive':
            case '-i': {
                parsed.interactive = true
                break
            }

            case '--project': {
                parsed.project = true
                break
            }

            default: {
                if (arg.startsWith('--from=')) parsed.from = arg.slice('--from='.length)
                else parsed.values.push(arg)
            }
        }
    }

    return parsed
}
