import {confirm, input, search, select} from '@inquirer/prompts'

export const prompts: {
    confirm: typeof confirm
    input: typeof input
    search: typeof search
    select: typeof select
} = {
    confirm,
    input,
    search,
    select,
}

export const terminal: {
    isInteractive: () => boolean
} = {
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
}
