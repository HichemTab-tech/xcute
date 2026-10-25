import {expect} from 'chai'

import {extractVariables, replaceAllVariables, replaceVariables} from '../../src/utils/variables.js'

describe('variables', () => {
  describe('extractVariables', () => {
    it('should extract single variable', () => {
      const result = extractVariables(['echo {{name}}'])
      expect([...result.keys()]).to.deep.equal(['name'])
    })

    it('should extract multiple variables from single command', () => {
      const result = extractVariables(['echo {{name}} {{version}}'])
      expect([...result.keys()]).to.deep.equal(['name', 'version'])
    })

    it('should extract variables from multiple commands', () => {
      const result = extractVariables(['mkdir {{name}}', 'cd {{name}}', 'echo {{author}}'])
      expect([...result.keys()]).to.deep.equal(['name', 'author'])
    })

    it('should return unique variables in order of first appearance', () => {
      const result = extractVariables(['{{a}} {{b}} {{a}}', '{{c}} {{b}}'])
      expect([...result.keys()]).to.deep.equal(['a', 'b', 'c'])
    })

    it('should return empty array for commands without variables', () => {
      const result = extractVariables(['echo hello', 'ls -la'])
      expect([...result.keys()]).to.deep.equal([])
    })

    it('should handle empty command array', () => {
      const result = extractVariables([])
      expect([...result.keys()]).to.deep.equal([])
    })

    it('should extract variable with description', () => {
      const result = extractVariables(['echo {{name::project name}}'])
      expect([...result.keys()]).to.deep.equal(['name'])
      expect(result.get('name')).to.deep.equal({
        description: 'project name',
        replacements: ['name::project name']
      })
    })

    it('should extract variable with default value only', () => {
      const result = extractVariables(['echo {{name|my-app}}'])

      expect([...result.keys()]).to.deep.equal(['name'])
      expect(result.get('name')).to.deep.equal({
        defaultValue: 'my-app',
        description: '',
        replacements: ['name|my-app']
      })
    })

    it('should extract variable with description and default value', () => {
      const result = extractVariables(['echo {{name::project name|my-app}}'])

      expect([...result.keys()]).to.deep.equal(['name'])
      expect(result.get('name')).to.deep.equal({
        defaultValue: 'my-app',
        description: 'project name',
        replacements: ['name::project name|my-app']
      })
    })

    it('should extract variable mixed with and without description', () => {
      // Order: without description first
      let result = extractVariables(['echo {{name}}', 'echo {{name::project name}}'])
      expect([...result.keys()]).to.deep.equal(['name'])
      expect(result.get('name')).to.deep.equal({
        description: 'project name',
        replacements: ['name', 'name::project name']
      })

      // Order: with description first
      result = extractVariables(['echo {{name::project name}}', 'echo {{name}}'])
      expect([...result.keys()]).to.deep.equal(['name'])
      expect(result.get('name')).to.deep.equal({
        description: 'project name',
        replacements: ['name::project name', 'name']
      })
    })

    it('should handle multiple occurrences with different descriptions (last wins or merge?)', () => {
         // Current implementation updates description if found. So last one with description wins.
        const result = extractVariables(['{{name::desc1}}', '{{name::desc2}}'])
        expect(result.get('name')?.description).to.equal('desc2')
        expect(result.get('name')?.replacements).to.include.members(['name::desc1', 'name::desc2'])
    })

    it('should keep the latest default value when the same variable appears multiple times', () => {
      const result = extractVariables(['{{name|first}}', '{{name::Project name|second}}'])

      expect(result.get('name')).to.deep.equal({
        defaultValue: 'second',
        description: 'Project name',
        replacements: ['name|first', 'name::Project name|second']
      })
    })
  })

  describe('replaceVariables', () => {
    it('should replace single variable', () => {
      const result = replaceVariables('echo {{name}}', {name: {replacements: ['name'], result: 'my-project'}})
      expect(result).to.equal('echo my-project')
    })

    it('should replace multiple variables', () => {
      const result = replaceVariables('{{cmd}} {{name}} --version {{ver}}', {
        cmd: {replacements: ['cmd'], result: 'npm'},
        name: {replacements: ['name'], result: 'test'},
        ver: {replacements: ['ver'], result: '1.0.0'},
      })
      expect(result).to.equal('npm test --version 1.0.0')
    })

    it('should replace variables with descriptions', () => {
        const result = replaceVariables('echo {{name::project name}} && cd {{name}}', {
            name: {
                replacements: ['name::project name', 'name'],
                result: 'my-project'
            }
        })
        expect(result).to.equal('echo my-project && cd my-project')
    })

    it('should replace variables with default-value syntax', () => {
      const result = replaceVariables('echo {{name::project name|my-app}} && cd {{name|my-app}}', {
        name: {
          replacements: ['name::project name|my-app', 'name|my-app'],
          result: 'custom-app'
        }
      })

      expect(result).to.equal('echo custom-app && cd custom-app')
    })

    it('should keep unreplaced variables as-is', () => {
      const result = replaceVariables('echo {{name}} {{unknown}}', {name: {replacements: ['name'], result: 'test'}})
      expect(result).to.equal('echo test {{unknown}}')
    })

    it('should handle command without variables', () => {
      const result = replaceVariables('echo hello', {name: {replacements: ['name'], result: 'test'}})
      expect(result).to.equal('echo hello')
    })

    it('should insert values literally, without expanding $ replacement patterns', () => {
      for (const value of ["$'", '$&', '$$', '$`', "a$'b$&c$$d$`e"]) {
        const result = replaceVariables("echo {{x|$'}} ; tail", {x: {replacements: ["x|$'"], result: value}})
        expect(result).to.equal(`echo ${value} ; tail`)
      }
    })

    it('should not replace tokens that appear inside an inserted value', () => {
      const result = replaceVariables('echo {{a}} {{b}}', {
        a: {replacements: ['a'], result: '{{b}}'},
        b: {replacements: ['b'], result: 'X'},
      })
      expect(result).to.equal('echo {{b}} X')
    })
  })

  describe('replaceAllVariables', () => {
    it('should replace variables in all commands', () => {
      const result = replaceAllVariables(
        ['mkdir {{name}}', 'cd {{name}}', 'npm init'],
        {name: {replacements: ['name'], result: 'my-app'}}
      )
      expect(result).to.deep.equal(['mkdir my-app', 'cd my-app', 'npm init'])
    })

    it('should handle empty command array', () => {
      const result = replaceAllVariables([], {name: {replacements: ['name'], result: 'test'}})
      expect(result).to.deep.equal([])
    })
  })
})
