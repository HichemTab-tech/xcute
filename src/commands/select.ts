import {Args, Flags} from '@oclif/core'

import type {ResolvedEntry} from '../utils/resolver.js'

import {BaseCommand} from "../BaseCommand.js";
import {loadCatalog} from '../utils/catalog.js'
import {getAllActions} from '../utils/config.js'
import {executeEntry} from '../utils/execute.js'
import {renderEntry} from '../utils/guide.js'
import {
    matchesTerm,
    type PickerChoice,
    pickerHeader,
    type PickerModel,
    type PickerValue,
    searchChoices,
    topicChoices,
    topicEntryChoices,
} from '../utils/picker.js'
import {prompts} from "../utils/prompts.js";

class Select extends BaseCommand {
    static aliases = ['s']

    static args = {
        filter: Args.string({description: 'Start with this search typed (names and descriptions)', required: false}),
    }

    static description = 'Search, select and run an action interactively'

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> build',
        '<%= config.bin %> s build',
    ]

    static flags = {
        filter: Flags.string({char: 'f', description: 'Start with this search typed (names and descriptions)'})
    }

    async run(): Promise<void> {
        const {args, flags} = await this.parse(Select)
        const cliTerm = flags.filter ?? args.filter
        const message = cliTerm ? `What do you need? (filter: ${cliTerm})` : 'What do you need?'
        const effective = (typed: string | undefined) => [cliTerm, typed].filter(Boolean).join(' ')

        const loaded = loadCatalog()
        for (const error of loaded?.errors ?? []) this.logToStderr(error)
        const validCatalog = loaded && loaded.catalog && loaded.errors.length === 0 ? loaded : undefined
        const model: PickerModel = {catalog: validCatalog, personal: getAllActions()}

        if (!validCatalog && Object.keys(model.personal).length === 0) {
            this.log('No actions registered')
            return
        }

        if (validCatalog) this.log(pickerHeader(model))

        const resolved = await this.pick(model, message, effective)
        if (!resolved) return
        await this.execute(resolved)
    }

    private async execute(resolved: ResolvedEntry): Promise<void> {
        if (resolved.source === 'project' && resolved.entry.kind === 'guide') {
            const mode = await prompts.select({
                choices: [
                    {name: 'Walk through it', value: 'walk'},
                    {name: 'Just read it', value: 'read'},
                ],
                message: `${resolved.name} is a guide`,
            })
            if (mode === 'read') {
                for (const line of renderEntry(resolved, [])) this.log(line)
                return
            }
        }

        this.log(`Running action: ${resolved.name}`)
        this.log('')

        const code = await executeEntry(resolved, {
            log: (msg) => this.log(msg),
            logError: (msg) => this.error(msg, {exit: false}),
            providedValues: [],
        })
        if (code !== 0) this.exit(code)
    }

    private async pick(
        model: PickerModel,
        message: string,
        effective: (typed: string | undefined) => string,
    ): Promise<ResolvedEntry | undefined> {
        for (;;) {
            const value: PickerValue = await prompts.search<PickerValue>({
                message,
                source(typed) {
                    const term = effective(typed)
                    if (model.catalog && term === '') return topicChoices(model)
                    return searchChoices(model, term)
                },
            })

            if (value.kind === 'entry') return value.resolved
            if (value.kind === 'back') continue

            const inTopic = await prompts.search<PickerValue>({
                message,
                source: (typed) => topicEntryChoices(model, value).filter(
                    (choice: PickerChoice) => choice.value.kind === 'back' || matchesTerm(typed, choice.name, choice.description),
                ),
            })
            if (inTopic.kind === 'entry') return inTopic.resolved
        }
    }
}

// noinspection JSUnusedGlobalSymbols
export default Select
