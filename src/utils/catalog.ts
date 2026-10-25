import fs from 'node:fs'
import path from 'node:path'

import {type Catalog, formatCatalogError, parseCatalog} from './catalog-schema.js'

export const CATALOG_FILE = 'xcute.yml'

export interface LoadedCatalog {
    catalog?: Catalog
    dir: string
    errors: string[]
    file: string
    name: string
}

function realpath(target: string): string {
    try {
        return fs.realpathSync(target)
    } catch {
        return path.resolve(target)
    }
}

export function findCatalogFile(startDir: string): string | undefined {
    const start = realpath(startDir)
    const chain = [start]
    for (let dir = path.dirname(start); dir !== chain.at(-1); dir = path.dirname(dir)) chain.push(dir)

    const gitIndex = chain.findIndex((dir) => fs.existsSync(path.join(dir, '.git')))
    // Outside a git repository only the starting directory is checked.
    const searched = gitIndex === -1 ? chain.slice(0, 1) : chain.slice(0, gitIndex + 1)
    return searched.map((dir) => path.join(dir, CATALOG_FILE)).find((candidate) => fs.existsSync(candidate))
}

export function loadCatalog(startDir: string = process.cwd()): LoadedCatalog | undefined {
    const found = findCatalogFile(startDir)
    if (!found) return undefined
    const file = realpath(found)
    const dir = path.dirname(file)
    let source: string
    try {
        source = fs.readFileSync(file, 'utf8')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {dir, errors: [`${file}: cannot read: ${message}`], file, name: path.basename(dir)}
    }

    const {catalog, errors} = parseCatalog(source)
    return {
        catalog,
        dir,
        errors: errors.map((error) => formatCatalogError(file, error)),
        file,
        name: catalog?.name ?? path.basename(dir),
    }
}
