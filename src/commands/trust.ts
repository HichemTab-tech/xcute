import {Flags} from '@oclif/core'

import {BaseCommand} from '../BaseCommand.js'
import {loadCatalog} from '../utils/catalog.js'
import {formatTrustChanges} from '../utils/trust-gate.js'
import {
    countCommands,
    diffRunnable,
    readTrust,
    revokeTrust,
    runnableParts,
    sameRunnable,
    writeTrust,
} from '../utils/trust.js'

class Trust extends BaseCommand {
    static description = 'Trust the commands in the current xcute.yml, or revoke that trust'

    static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --revoke']

    static flags = {
        revoke: Flags.boolean({description: 'Remove the trust record for this xcute.yml'}),
    }

    async run(): Promise<void> {
        const {flags} = await this.parse(Trust)
        const loaded = loadCatalog()
        if (!loaded) this.error('No xcute.yml found from here.')

        if (flags.revoke) {
            this.log(revokeTrust(loaded.file) ? `Trust revoked for ${loaded.file}.` : `${loaded.file} was not trusted.`)
            return
        }

        if (!loaded.catalog) {
            for (const error of loaded.errors) this.log(error)
            this.exit(1)
        }

        const current = runnableParts(loaded.catalog)
        const stored = readTrust(loaded.file)
        if (stored && sameRunnable(stored, current)) {
            this.log(`${loaded.file} is already trusted.`)
            return
        }

        writeTrust(loaded.file, current)
        if (stored) {
            for (const line of formatTrustChanges(diffRunnable(stored, current, loaded.catalog))) this.log(line)
            this.log(`Trusted ${loaded.file}.`)
        } else {
            this.log(`Trusted ${loaded.file} (${Object.keys(current).length} entries, ${countCommands(current)} commands).`)
        }
    }
}

// noinspection JSUnusedGlobalSymbols
export default Trust
