import {expect} from 'chai'

import {prompts, terminal} from '../../src/utils/prompts.js'

describe('prompts', () => {
    let origConfirm: typeof prompts.confirm
    let origInput: typeof prompts.input
    let origSelect: typeof prompts.select

    beforeEach(() => {
        origConfirm = prompts.confirm
        origInput = prompts.input
        origSelect = prompts.select
    })

    afterEach(() => {
        prompts.confirm = origConfirm
        prompts.input = origInput
        prompts.select = origSelect
    })

    it('exports confirm, input and select', () => {
        expect(prompts).to.have.property('confirm')
        expect(prompts).to.have.property('input')
        expect(prompts).to.have.property('select')
    })

    it('forwards confirm calls', async () => {
        prompts.confirm = (async (...args: unknown[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((args[0] as any).message).to.equal('are-you-sure')
            return true
        })

        const result = await prompts.confirm({message: 'are-you-sure'})
        expect(result).to.equal(true)
    })

    it('forwards input calls', async () => {
        prompts.input = (async (...args: unknown[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((args[0] as any).message).to.equal('enter-name')
            return 'alice'
        })

        const result = await prompts.input({message: 'enter-name'})
        expect(result).to.equal('alice')
    })

    it('forwards select calls', async () => {
        prompts.select = (async (...args: unknown[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((args[0] as any).message).to.equal('pick-one')
            return 'choice-1'
        }) as typeof prompts.select

        const result = await prompts.select({choices: ['choice-1', 'choice-2'], message: 'pick-one'})
        expect(result).to.equal('choice-1')
    })

    it('exposes search and terminal.isInteractive', () => {
        expect(prompts).to.have.property('search')
        expect(terminal.isInteractive).to.be.a('function')
        expect(terminal.isInteractive()).to.be.a('boolean')
    })
})
