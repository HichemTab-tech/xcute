import {expect} from 'chai'

import {parseShortcutArgs} from '../../src/utils/shortcut.js'

describe('parseShortcutArgs', () => {
    it('splits control flags from values', () => {
        expect(parseShortcutArgs(['table', '-i', '0', '--from', '4', '--project'])).to.deep.equal({
            dryRun: false, from: '4', interactive: true, project: true, values: ['table', '0'],
        })
    })

    it('accepts --from=4', () => {
        expect(parseShortcutArgs(['--from=4', '--dry-run'])).to.deep.equal({
            dryRun: true, from: '4', interactive: false, project: false, values: [],
        })
    })

    it('turns a bare trailing --from into an empty value', () => {
        expect(parseShortcutArgs(['table', '--from'])).to.deep.equal({
            dryRun: false, from: '', interactive: false, project: false, values: ['table'],
        })
    })
})
