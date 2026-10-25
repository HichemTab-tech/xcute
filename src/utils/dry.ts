import {Command} from "@oclif/core";

import {getAllActions} from "./config.js";

export function buildChoices (this: Command, filter?: string) {
    const actions = getAllActions(filter)
    const names = Object.keys(actions)

    if (names.length === 0) {
        this.log('No actions registered')
        return
    }

    // Build choices for the select prompt
    return {
        actions,
        choices: names.map((name, index) => {
            const action = actions[name]
            const description = action.description ? ` - ${action.description}` : ''
            return {
                name: `${index + 1}. ${name}${description}`,
                value: name,
            }
        }),
    };
}

export const truncate = (s: string | undefined, n = 100) => {
    if (!s) return ''
    return s.length > n ? s.slice(0, n) + '...' : s
}