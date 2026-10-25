import {Hook} from '@oclif/core'

import {loadCatalog} from '../utils/catalog.js'
import {executeEntry} from '../utils/execute.js'
import {resolveEntry} from '../utils/resolver.js'
import {parseShortcutArgs} from '../utils/shortcut.js'

const hook: Hook<'command_not_found'> = async function () {
    // oclif joins spaced args into the id with ':', so the real name is the raw first argument.
    const name = process.argv[2]
    if (!name || name.startsWith('-')) {
        return
    }

    const args = parseShortcutArgs(process.argv.slice(3))
    const loaded = loadCatalog()
    const resolved = resolveEntry(name, loaded, args.project)

    if (!resolved) {
        for (const error of loaded?.errors ?? []) console.error(error)
        return
    }

    const code = await executeEntry(resolved, {
        dryRun: args.dryRun,
        from: args.from,
        interactive: args.interactive,
        log: (msg) => console.log(msg),
        logError: (msg) => console.error(msg),
        providedValues: args.values,
    })

    process.exit(code)
}

// noinspection JSUnusedGlobalSymbols
export default hook
