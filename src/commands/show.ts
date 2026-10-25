import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../BaseCommand.js'
import {loadCatalog} from '../utils/catalog.js'
import {renderEntry} from '../utils/guide.js'
import {resolveEntry} from '../utils/resolver.js'

class Show extends BaseCommand {
    static args = {
        name: Args.string({description: 'Action or catalog entry to show', required: true}),
    }

    static description = 'Show an action or catalog entry without running it'

    static examples = [
        '<%= config.bin %> show rehearsal',
        '<%= config.bin %> show rehearsal table 0',
    ]

    static flags = {
        project: Flags.boolean({description: 'Only look in the project catalog'}),
    }

    static strict = false

    async run(): Promise<void> {
        const {args, argv, flags} = await this.parse(Show)

        const loaded = loadCatalog()
        const resolved = resolveEntry(args.name, loaded, flags.project)

        if (!resolved) {
            for (const error of loaded?.errors ?? []) this.logToStderr(error)
            this.error(`Action "${args.name}" not found`)
        }

        for (const line of renderEntry(resolved, (argv as string[]).slice(1))) this.log(line)
    }
}

// noinspection JSUnusedGlobalSymbols
export default Show
