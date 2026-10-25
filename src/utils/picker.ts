export function matchesTerm(term: string | undefined, ...fields: (string | undefined)[]): boolean {
    const words = (term ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return true
    const haystack = fields.filter((field): field is string => field !== undefined).map((field) => field.toLowerCase())
    return words.every((word) => haystack.some((field) => field.includes(word)))
}
