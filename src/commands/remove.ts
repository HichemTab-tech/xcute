import {Args, Flags} from '@oclif/core'

import {BaseCommand} from "../BaseCommand.js";
import {loadCatalog} from '../utils/catalog.js'
import {actionExists, deleteAction} from '../utils/config.js'
import {buildChoices} from "../utils/dry.js";
import {prompts} from "../utils/prompts.js";
import {resolveEntry} from '../utils/resolver.js'

class Remove extends BaseCommand {
    static args = {
        name: Args.string({description: 'Action name to remove', required: false}),
    }

    static description = 'Remove a registered action'

    static examples = [
        '<%= config.bin %> <%= command.id %> react',
        '<%= config.bin %> <%= command.id %> --select',
    ]

    // noinspection SqlNoDataSourceInspection
    static flags = {
        select: Flags.boolean({char: 's', description: 'Select action from a list'}),
        yes: Flags.boolean({allowNo: false, char: 'y', description: 'Skip confirmation prompting'}),
    }

    async run(): Promise<void> {
        const {args, flags} = await this.parse(Remove)

        let actionName: string

        if (flags.select) {
            const choicesResult = buildChoices.bind(this)()
            if (!choicesResult) return;

            actionName = await prompts.select({
                choices: choicesResult.choices,
                message: 'Select an action to remove:',
            })
        } else if (args.name) {
            actionName = args.name
        } else {
            this.error('Action name is required. Use --select to choose from a list.')
        }

        // Check if action exists
        if (!actionExists(actionName)) {
            const loaded = loadCatalog()
            if (loaded && resolveEntry(actionName, loaded, true)) {
                this.error(`"${actionName}" comes from ${loaded.file}. Edit that file to remove it.`)
            }

            this.error(`Action "${actionName}" not found`)
        }

        if (!flags.yes) {
            // Confirm deletion
            const confirmed = await prompts.confirm({
                default: false,
                message: `Remove action "${actionName}"?`,
            })

            if (!confirmed) {
                this.log('Aborted')
                return
            }
        }

        // Delete the action
        deleteAction(actionName)
        this.log(`Action "${actionName}" removed`)
    }
}

// noinspection JSUnusedGlobalSymbols
export default Remove