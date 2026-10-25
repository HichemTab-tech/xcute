import {expect} from 'chai'

import {matchesTerm} from '../../src/utils/picker.js'

describe('matchesTerm', () => {
    it('matches everything when the term is empty', () => {
        expect(matchesTerm(undefined, 'a')).to.equal(true)
        expect(matchesTerm('  ', 'a')).to.equal(true)
    })

    it('is case-insensitive', () => {
        expect(matchesTerm('REACT', 'react-app')).to.equal(true)
    })

    it('requires every word to appear in some field', () => {
        expect(matchesTerm('preview fail', 'rerun', 'Re-run failed site previews')).to.equal(true)
        expect(matchesTerm('preview nope', 'rerun', 'Re-run failed site previews')).to.equal(false)
    })

    it('ignores undefined fields', () => {
        expect(matchesTerm('x', undefined)).to.equal(false)
    })
})
