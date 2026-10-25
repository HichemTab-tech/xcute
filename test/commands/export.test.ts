import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {saveConfig, setConfigDir} from '../../src/utils/config.js'
import {createCatalogRepo} from '../helpers/catalog-repo.js'

describe('export', () => {
  let testDir: string
  let outputDir: string

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-test-'))
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prj-reg-output-'))
    setConfigDir(testDir)
    
    // Setup initial config
    saveConfig({
        'test-action': {
            commands: ['echo test']
        }
    })
  })

  afterEach(() => {
    fs.rmSync(testDir, {force: true, recursive: true})
    fs.rmSync(outputDir, {force: true, recursive: true})
  })

  it('exports registry to a file', async () => {
    const outputFile = path.join(outputDir, 'backup.json')
    const {stdout} = await runCommand(['export', outputFile])
    
    expect(stdout).to.contain(`Registry exported to ${outputFile}`)
    expect(fs.existsSync(outputFile)).to.be.true
    
    const content = JSON.parse(fs.readFileSync(outputFile, 'utf8'))
    expect(content['test-action']).to.exist
    expect(content['test-action'].commands).to.deep.equal(['echo test'])
  })

  it('exports registry to a directory', async () => {
    const {stdout} = await runCommand(['export', outputDir])
    
    const expectedFile = path.join(outputDir, 'xcute.json')
    expect(stdout).to.contain(`Registry exported to ${expectedFile}`)
    expect(fs.existsSync(expectedFile)).to.be.true
    
    const content = JSON.parse(fs.readFileSync(expectedFile, 'utf8'))
    expect(content['test-action']).to.exist
  })

  it('never exports catalog entries', async () => {
    const repo = createCatalogRepo('version: 1\nentries:\n  lint:\n    description: Lint.\n    commands:\n      - pnpm lint\n')
    try {
      const outputFile = path.join(outputDir, 'in-repo.json')
      await runCommand(['export', outputFile])
      const content = JSON.parse(fs.readFileSync(outputFile, 'utf8'))
      expect(Object.keys(content)).to.deep.equal(['test-action'])
    } finally {
      repo.cleanup()
    }
  })
})
