import {expect} from 'chai'

import {Separator} from '@inquirer/prompts'

import type {Catalog} from '../../src/utils/catalog-schema.js'
import {matchesTerm, type PickerChoice, type PickerModel, pickerHeader, searchChoices, topicChoices, topicEntryChoices} from '../../src/utils/picker.js'

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

describe('picker choices', () => {
    const catalog: Catalog = {
        entries: [
            {commands: ['pnpm build'], description: 'Build the API.', kind: 'commands', name: 'build-api', topic: 'build'},
            {commands: ['gh run'], description: 'Re-run failed site previews.', kind: 'commands', name: 'rerun-site-previews', topic: 'sites'},
            {description: 'Walk the tour.', kind: 'guide', name: 'tour', steps: [{kind: 'manual', manual: 'x', title: 'Look'}], topic: 'sites'},
        ],
        topics: [
            {id: 'build', summary: 'compile', title: 'Build'},
            {id: 'sites', title: 'Sites & docs'},
            {id: 'empty', title: 'Empty'},
        ],
    }
    const model: PickerModel = {
        catalog: {catalog, dir: '/x', errors: [], file: '/x/xcute.yml', name: 'Demo'},
        personal: {mine: {commands: ['echo mine'], description: 'My preview helper'}},
    }

    it('builds the header from catalog and personal counts', () => {
        expect(pickerHeader(model)).to.equal('Demo · 3 entries in 3 topics · 1 of your actions')
    })

    it('lists topics then Your actions when nothing is typed', () => {
        const choices = topicChoices(model)
        expect(choices).to.have.length(4)
        expect((choices[0] as PickerChoice).name).to.match(/^Build\s+compile\s+\(1 entry\)$/)
        expect((choices[1] as PickerChoice).name).to.contain('(2 entries)')
        expect(choices[2]).to.be.instanceOf(Separator)
        expect((choices[3] as PickerChoice).name).to.contain('Your actions')
        expect((choices[3] as PickerChoice).value).to.deep.equal({kind: 'personal-topic'})
    })

    it('adds Other only when entries have no known topic', () => {
        expect(topicChoices(model).some((c) => 'name' in c && c.name.startsWith('Other'))).to.equal(false)
        const withOther: PickerModel = {
            ...model,
            catalog: {...model.catalog!, catalog: {...catalog, entries: [...catalog.entries, {commands: ['x'], description: 'd', kind: 'commands', name: 'loose'}]}},
        }
        expect(topicChoices(withOther).some((c) => 'name' in c && c.name.startsWith('Other'))).to.equal(true)
    })

    it('searches names and descriptions across catalog and personal', () => {
        expect(searchChoices(model, 'preview fail').map((c) => c.name)).to.deep.equal(['Sites & docs › rerun-site-previews'])
        expect(searchChoices(model, 'preview').map((c) => c.name)).to.deep.equal(['Sites & docs › rerun-site-previews', 'Your actions › mine'])
    })

    it('marks guides and shows the first command in entry choices', () => {
        const choices = topicEntryChoices(model, {kind: 'topic', topicId: 'sites'})
        expect(choices.map((c) => c.name)).to.deep.equal(['← Back to topics', 'rerun-site-previews', 'tour  guide'])
        expect(choices[1].description).to.equal('Re-run failed site previews.  $ gh run')
        expect(choices[2].description).to.equal('Walk the tour.')
    })

    it('lists personal actions without a topic prefix outside a catalog', () => {
        expect(searchChoices({personal: model.personal}, '').map((c) => c.name)).to.deep.equal(['mine'])
    })
})
