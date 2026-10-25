import {Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'
import stripAnsi from 'strip-ansi'

import type {CatalogEntry} from '../utils/catalog-schema.js'

import {BaseCommand} from "../BaseCommand.js";
import {loadCatalog} from '../utils/catalog.js'
import {getAllActions} from '../utils/config.js'
import {truncate} from "../utils/dry.js";
import {matchesTerm} from '../utils/picker.js'
import {isShadowed} from '../utils/resolver.js'

interface ListRow {
    commands: string
    description?: string
    guideSteps?: number
    name: string
}

function guideMark(row: ListRow): string {
    return row.guideSteps === undefined ? '' : ` (guide, ${row.guideSteps} steps)`
}

class List extends BaseCommand {
    static description = 'List all registered actions'

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> -c',
        '<%= config.bin %> <%= command.id %> -f react'
    ]

    static flags = {
        filter: Flags.string({char: 'f', description: 'Filter actions by name or description words (case-insensitive)'}),
        table: Flags.boolean({allowNo: true, char: 't', default: true, description: 'Show output in table format'}),
        "with-content": Flags.boolean({char: 'c', description: 'With action content'})
    }

    async run(): Promise<void> {
        const {flags} = await this.parse(List)
        const withContent = flags['with-content']
        const personal: ListRow[] = Object.entries(getAllActions())
            .filter(([name, action]) => matchesTerm(flags.filter, name, action.description))
            .map(([name, action]) => ({
                commands: action.commands ? action.commands.join(' && ') : '',
                description: action.description,
                name,
            }))

        const loaded = loadCatalog()
        const catalog = loaded?.catalog
        if (loaded && loaded.errors.length > 0) {
            for (const error of loaded.errors) this.log(error)
        }

        if (!loaded || !catalog || loaded.errors.length > 0) {
            if (personal.length === 0) {
                this.log('No actions registered')
                return
            }

            this.printRows(personal, flags.table, withContent)
            return
        }

        const entries = catalog.entries.filter((entry) => matchesTerm(flags.filter, entry.name, entry.description))
        const toRow = (entry: CatalogEntry): ListRow => ({
            commands: entry.kind === 'guide' ? `${entry.steps.length} steps` : entry.commands.join(' && '),
            description: entry.description,
            guideSteps: entry.kind === 'guide' ? entry.steps.length : undefined,
            name: isShadowed(entry.name) ? `${entry.name} (your action wins)` : entry.name,
        })
        const knownTopics = new Set(catalog.topics.map((topic) => topic.id))
        const blocks: {rows: ListRow[]; title: string}[] = [
            ...catalog.topics.map((topic) => ({
                rows: entries.filter((entry) => entry.topic === topic.id).map((entry) => toRow(entry)),
                title: topic.title,
            })),
            {rows: entries.filter((entry) => !entry.topic || !knownTopics.has(entry.topic)).map((entry) => toRow(entry)), title: 'Other'},
            {rows: personal, title: 'Your actions'},
        ].filter((block) => block.rows.length > 0)

        if (blocks.length === 0) {
            this.log(flags.filter === undefined ? 'No actions registered' : `No actions match "${flags.filter}"`)
            return
        }

        this.log(`${chalk.bold(loaded.name)} ${chalk.grey(loaded.file)}`)
        for (const block of blocks) {
            this.log('')
            this.log(chalk.bold(block.title))
            this.printRows(block.rows, flags.table, withContent)
        }
    }

    private printRows(rows: ListRow[], asTable: boolean, withContent: boolean): void {
        if (asTable) {
            const headers = ['Name', 'Description']
            if (withContent) headers.push('Commands')
            const table = new Table({head: headers})

            for (const row of rows) {
                const desc = (row.description ? truncate(row.description) : 'No description') + guideMark(row)
                if (withContent) {
                    const truncated = truncate(stripAnsi(row.commands))
                    const coloredCommands = truncated.split(' && ').join(chalk.cyan(' && '))
                    table.push([chalk.green(row.name), desc, coloredCommands])
                } else {
                    table.push([chalk.green(row.name), desc])
                }
            }

            this.log(table.toString())
            return
        }

        for (const row of rows) {
            let result = chalk.green(row.name)
            result += row.description ? ` ${chalk.yellow('-')} ${truncate(row.description)}` : ` ${chalk.yellow('-')} ${chalk.grey('No description')}`
            result += guideMark(row)

            if (row.commands && withContent) {
                const truncated = truncate(stripAnsi(row.commands))
                const coloredCommands = truncated.split(' && ').join(chalk.cyan(' && '))
                result += ` ${chalk.yellow('-')} ${coloredCommands}`
            }

            this.log(result)
        }
    }
}

// noinspection JSUnusedGlobalSymbols
export default List