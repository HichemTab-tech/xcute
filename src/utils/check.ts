import fs from 'node:fs'
import path from 'node:path'

import type {LoadedCatalog} from './catalog.js'

export interface CheckReport {
    errors: string[]
    missingScripts: Array<{entry: string; script: string}>
    noPackageJson: boolean
    uncoveredScripts: string[]
}

const PNPM_BUILT_INS = new Set([
    'add', 'approve-builds', 'audit', 'bin', 'cache', 'config', 'create', 'dedupe', 'deploy', 'dlx', 'doctor', 'env',
    'exec', 'fetch', 'help', 'i', 'import', 'info', 'init', 'install', 'install-test', 'licenses', 'link', 'list', 'ln',
    'ls', 'outdated', 'pack', 'patch', 'patch-commit', 'prune', 'publish', 'rebuild', 'remove', 'rm', 'root',
    'self-update', 'server', 'setup', 'store', 'un', 'uninstall', 'unlink', 'up', 'update', 'version', 'view',
    'whoami', 'why',
])
// pnpm subcommands that run a script under another name.
const PNPM_SCRIPT_ALIASES: Record<string, string> = {t: 'test'}
const YARN_BUILT_INS = new Set([
    'add', 'bin', 'cache', 'config', 'create', 'dedupe', 'dlx', 'exec', 'explain', 'info', 'init', 'install', 'link',
    'npm', 'pack', 'plugin', 'publish', 'rebuild', 'remove', 'set', 'unlink', 'up', 'upgrade', 'version', 'why',
    'workspace', 'workspaces',
])
const SKIP_TOKENS = new Set(['--cwd', '--dir', '--filter', '--prefix', '--recursive', '-C', '-F', '-r'])

function usable(name: string | undefined): string | undefined {
    return name && !name.startsWith('-') && !name.includes('{{') ? name : undefined
}

function scriptOfSegment(tokens: string[], binDir: string | undefined): string | undefined {
    const [manager, first, second] = tokens
    const isBinary = (name: string): boolean => binDir !== undefined && fs.existsSync(path.join(binDir, name))

    switch (manager) {
        case 'bun': {
            return first === 'run' ? usable(second) : undefined
        }

        case 'npm': {
            return first === 'run' || first === 'run-script' ? usable(second) : undefined
        }

        case 'pnpm':
        case 'yarn': {
            if (first === 'run') return usable(second)
            const name = usable(first)
            if (!name) return undefined
            if (manager === 'pnpm' && Object.hasOwn(PNPM_SCRIPT_ALIASES, name)) return PNPM_SCRIPT_ALIASES[name]
            const builtIns = manager === 'pnpm' ? PNPM_BUILT_INS : YARN_BUILT_INS
            return builtIns.has(name) || isBinary(name) ? undefined : name
        }

        default: {
            return undefined
        }
    }
}

export function scriptCalledBy(command: string, binDir?: string): string[] {
    const scripts: string[] = []
    for (const segment of command.split(/&&|\|\||;/)) {
        const tokens = segment.split(/\s+/).filter(Boolean)
        while (tokens.length > 0 && /^[A-Za-z_]\w*=/.test(tokens[0])) tokens.shift()
        if (tokens.some((token) => SKIP_TOKENS.has(token))) continue
        const script = scriptOfSegment(tokens, binDir)
        if (script) scripts.push(script)
    }

    return scripts
}

function readScripts(dir: string): string[] | undefined {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {scripts?: Record<string, unknown>}
        return Object.keys(pkg.scripts ?? {})
    } catch {
        return undefined
    }
}

export function checkCatalog(loaded: LoadedCatalog): CheckReport {
    const report: CheckReport = {errors: loaded.errors, missingScripts: [], noPackageJson: false, uncoveredScripts: []}
    if (!loaded.catalog) return report

    const scripts = readScripts(loaded.dir)
    if (!scripts) {
        report.noPackageJson = true
        return report
    }

    const binDir = path.join(loaded.dir, 'node_modules', '.bin')
    const called = new Set<string>()
    for (const entry of loaded.catalog.entries) {
        const commands = entry.kind === 'commands' ? entry.commands : entry.steps.flatMap((step) => step.run ?? [])
        const seen = new Set<string>()
        for (const command of commands) {
            for (const script of scriptCalledBy(command, binDir)) {
                called.add(script)
                if (!scripts.includes(script) && !seen.has(script)) {
                    seen.add(script)
                    report.missingScripts.push({entry: entry.name, script})
                }
            }
        }
    }

    report.uncoveredScripts = scripts.filter((script) => !called.has(script))
    return report
}
