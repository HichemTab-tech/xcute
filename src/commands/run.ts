import {Args, Flags} from '@oclif/core'

import {BaseCommand} from "../BaseCommand.js";
import {loadCatalog} from '../utils/catalog.js'
import {executeEntry} from '../utils/execute.js'
import {resolveEntry} from '../utils/resolver.js'

class Run extends BaseCommand {
    static args = {
        name: Args.string({description: 'Action name to run', required: true}),
    }

    static description = 'Run a registered action'

    static examples = [
        '<%= config.bin %> run react my-app',
        '<%= config.bin %> run react --interactive',
        '<%= config.bin %> run react my-app --dry-run',
    ]

    static flags = {
        'dry-run': Flags.boolean({char: 'd', description: 'Show the resolved command without executing it'}),
        from: Flags.string({description: 'Start a guide at this step'}),
        interactive: Flags.boolean({char: 'i', description: 'Interactive mode - prompt for all variables'}),
        project: Flags.boolean({description: 'Only look in the project catalog'}),
    }

    static strict = false // Allow variable number of arguments

    async run(): Promise<void> {
        const {args, argv, flags} = await this.parse(Run)

        const actionName = args.name

        const loaded = loadCatalog()
        const resolved = resolveEntry(actionName, loaded, flags.project)

        if (!resolved) {
            for (const error of loaded?.errors ?? []) this.logToStderr(error)
            this.error(`Action "${actionName}" not found`)
        }

        // Get provided variable values from remaining arguments
        const allArgs = argv as string[]
        const providedValues = allArgs.slice(1) // Skip the action name

        const code = await executeEntry(resolved, {
            dryRun: flags['dry-run'],
            from: flags.from,
            interactive: flags.interactive,
            log: (msg) => this.log(msg),
            logError: (msg) => this.error(msg, {exit: false}),
            providedValues,
        })

        if (code !== 0) {
            this.exit(code)
        }
    }
}

// noinspection JSUnusedGlobalSymbols
export default Run