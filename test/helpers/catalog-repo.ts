import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function createCatalogRepo(
    source: string | undefined,
    options: {git?: boolean} = {},
): {cleanup: () => void; dir: string} {
    const previous = process.cwd()
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xcute-catalog-')))
    if (options.git !== false) fs.mkdirSync(path.join(dir, '.git'))
    if (source !== undefined) fs.writeFileSync(path.join(dir, 'xcute.yml'), source)
    process.chdir(dir)
    return {
        cleanup() {
            process.chdir(previous)
            fs.rmSync(dir, {force: true, recursive: true})
        },
        dir,
    }
}
