const VARIABLE_PATTERN = /\{\{([\s\S]*?)}}/g

export interface VariableDefinition {
    defaultValue?: string
    description: string
    replacements: string[]
}

export function parseVariableToken(text: string): { defaultValue?: string; description: string; hasDefaultValue: boolean; name: string } {
    const [metadata, ...defaultParts] = text.split('|')
    const hasDefaultValue = defaultParts.length > 0
    const defaultValue = hasDefaultValue ? defaultParts.join('|').trim() : undefined
    const [rawName, ...descriptionParts] = metadata.split('::')

    return {
        defaultValue,
        description: descriptionParts.join('::').trim(),
        hasDefaultValue,
        name: rawName.trim(),
    }
}

export function extractVariables(commands: string[]): Map<string, VariableDefinition> {
    const variables = new Map<string, VariableDefinition>()
    for (const command of commands) {
        let match: null | RegExpExecArray
        const regex = new RegExp(VARIABLE_PATTERN.source, 'g')
        while ((match = regex.exec(command)) !== null) {
            const text = match[1]
            const {defaultValue, description, hasDefaultValue, name} = parseVariableToken(text)

            if (!name) {
                continue
            }

            const existingVariable = variables.get(name)

            if (existingVariable) {
                existingVariable.replacements.push(text)
                if (description) {
                    existingVariable.description = description
                }

                if (hasDefaultValue) {
                    existingVariable.defaultValue = defaultValue
                }

                continue
            }

            variables.set(name, {
                ...(hasDefaultValue ? {defaultValue} : {}),
                description,
                replacements: [text],
            })
        }
    }

    return variables
}

export function replaceVariables(command: string, values: Record<string, {
    replacements: string[],
    result: string
}>): string {
    for (const value of Object.values(values)) {
        for (const replacement of value.replacements) {
            command = command.replace(`{{${replacement}}}`, value.result)
        }
    }

    return command;
}

export function replaceAllVariables(commands: string[], values: Record<string, {
    replacements: string[],
    result: string
}>): string[] {
    return commands.map((cmd) => replaceVariables(cmd, values))
}
