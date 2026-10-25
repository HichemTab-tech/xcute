import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {fileURLToPath} from "node:url";

import {presets} from "../presets/default.js";

export interface Action {
    commands: string[]
    description?: string
}

export interface ConfigData {
    [key: string]: Action
}

const customConfig: {
    customDir: string | undefined,
    includePresets: boolean
} = {
    customDir: undefined,
    includePresets: true
};

export function getCustomConfig() {
    return customConfig
}

export function setConfigDir(dir: string|undefined): void {
    customConfig.customDir = dir
}

export function setIncludePresets(include: boolean): void {
    customConfig.includePresets = include
}

export const getConfigDir = () => {
    if (customConfig.customDir) return customConfig.customDir

    if (process.env.XCUTE_HOME) return path.resolve(process.env.XCUTE_HOME)

    if (process.env.NODE_ENV === 'development') {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        return path.resolve(__dirname, '../../test-config-dir')
    }

    return path.join(os.homedir(), '.xcute')
}

export const getConfigFile = () => path.join(getConfigDir(), 'config.json')



function ensureConfigDir(): void {
    const dir = getConfigDir()
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true})
    }
}

function ensureConfigFile(withoutPreset = false): void {
    ensureConfigDir()
    const file = getConfigFile()
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({}, null, 2), 'utf8')
        if (customConfig.includePresets && !withoutPreset) writePresetConfig()
    }
}

export function writePresetConfig(): void {
    saveConfig(presets);
}

export function loadConfig(withoutPreset = false): ConfigData {
    ensureConfigFile(withoutPreset)
    const content = fs.readFileSync(getConfigFile(), 'utf8')
    try {
        return JSON.parse(content) as ConfigData
    } catch {
        return {}
    }
}

export function saveConfig(config: ConfigData): void {
    ensureConfigFile()
    fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2), 'utf8')
}

export function getAction(name: string): Action | undefined {
    const config = loadConfig()
    return config[name]
}

export function setAction(name: string, action: Action): void {
    const config = loadConfig()
    config[name] = action
    saveConfig(config)
}

export function deleteAction(name: string): boolean {
    const config = loadConfig()
    if (config[name]) {
        delete config[name]
        saveConfig(config)
        return true
    }

    return false
}

export function actionExists(name: string): boolean {
    const config = loadConfig()
    return name in config
}

export function getAllActions(filter?: string): ConfigData {
    const config = loadConfig()
    if (!filter) return config
    return Object.fromEntries(Object.entries(config).filter(([name]) => name.toLowerCase().includes(filter.toLowerCase())))
}



