import {BaseCommand} from '../BaseCommand.js'
import {loadCatalog} from '../utils/catalog.js'
import {checkCatalog} from '../utils/check.js'

class Check extends BaseCommand {
    static description = 'Validate the current xcute.yml and compare its commands with package.json scripts'

    static examples = ['<%= config.bin %> <%= command.id %>']

    async run(): Promise<void> {
        await this.parse(Check)
        const loaded = loadCatalog()
        if (!loaded) this.error('No xcute.yml found from here.')

        const report = checkCatalog(loaded)
        if (report.errors.length > 0) {
            for (const error of report.errors) this.log(error)
        } else {
            this.log(`${loaded.file}: OK (${loaded.catalog?.entries.length ?? 0} entries)`)
        }

        if (report.missingScripts.length > 0) {
            this.log('Missing scripts:')
            for (const {entry, script} of report.missingScripts) {
                this.log(`  ${entry} calls "${script}", which is not in package.json`)
            }
        }

        if (report.uncoveredScripts.length > 0) {
            this.log(`Scripts no entry mentions (${report.uncoveredScripts.length}):`)
            this.log(`  ${report.uncoveredScripts.join(', ')}`)
        }

        if (report.errors.length > 0 || report.missingScripts.length > 0) this.exit(1)
    }
}

// noinspection JSUnusedGlobalSymbols
export default Check
