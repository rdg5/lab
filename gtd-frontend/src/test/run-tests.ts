#!/usr/bin/env node
/**
 * Test Runner Script for GTD Frontend Tests
 * 
 * This script provides comprehensive test running capabilities with:
 * - Component tests
 * - Hook tests  
 * - Integration tests
 * - Coverage reporting
 * - Test result analysis
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

interface TestSuite {
  name: string
  pattern: string
  description: string
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'components',
    pattern: 'src/components/**/*.test.{ts,tsx}',
    description: 'Component tests including TodoItem, TodoList, TodoForm, etc.'
  },
  {
    name: 'hooks',
    pattern: 'src/hooks/**/*.test.{ts,tsx}',
    description: 'Custom hook tests for useTodos, useAuth, useSync, useOfflineQueue'
  },
  {
    name: 'integration',
    pattern: 'src/test/**/*.test.{ts,tsx}',
    description: 'Integration tests for real-time updates and end-to-end workflows'
  },
  {
    name: 'gtd-specific',
    pattern: 'src/**/*{gtd,context,audit}*.test.{ts,tsx}',
    description: 'GTD methodology specific tests'
  }
]

interface TestOptions {
  suite?: string
  coverage?: boolean
  watch?: boolean
  ui?: boolean
  reporter?: 'default' | 'verbose' | 'json' | 'junit'
  bail?: boolean
  timeout?: number
}

class TestRunner {
  private options: TestOptions

  constructor(options: TestOptions = {}) {
    this.options = options
  }

  async runTests(): Promise<void> {
    console.log('🧪 Starting GTD Frontend Test Suite')
    console.log('=====================================\n')

    try {
      if (this.options.suite) {
        await this.runSpecificSuite(this.options.suite)
      } else {
        await this.runAllSuites()
      }
      
      if (this.options.coverage) {
        await this.generateCoverageReport()
      }

      console.log('\n✅ All tests completed successfully!')
    } catch (error) {
      console.error('\n❌ Test execution failed:', error)
      process.exit(1)
    }
  }

  private async runSpecificSuite(suiteName: string): Promise<void> {
    const suite = TEST_SUITES.find(s => s.name === suiteName)
    
    if (!suite) {
      throw new Error(`Unknown test suite: ${suiteName}. Available suites: ${TEST_SUITES.map(s => s.name).join(', ')}`)
    }

    console.log(`📋 Running ${suite.name} tests`)
    console.log(`   ${suite.description}`)
    console.log(`   Pattern: ${suite.pattern}\n`)

    await this.executeVitest(suite.pattern)
  }

  private async runAllSuites(): Promise<void> {
    console.log('📋 Running all test suites:\n')

    for (const suite of TEST_SUITES) {
      console.log(`• ${suite.name}: ${suite.description}`)
    }
    console.log()

    await this.executeVitest()
  }

  private async executeVitest(pattern?: string): Promise<void> {
    const vitestCmd = this.buildVitestCommand(pattern)
    
    console.log(`🏃 Executing: ${vitestCmd}\n`)

    try {
      const { stdout, stderr } = await execAsync(vitestCmd)
      
      if (stdout) console.log(stdout)
      if (stderr) console.error(stderr)
      
    } catch (error: any) {
      if (error.code === 1) {
        // Test failures - expected, show output
        console.log(error.stdout)
        console.error(error.stderr)
        throw new Error('Some tests failed')
      } else {
        // Unexpected error
        throw error
      }
    }
  }

  private buildVitestCommand(pattern?: string): string {
    const parts = ['npx vitest run']

    if (pattern) {
      parts.push(pattern)
    }

    if (this.options.coverage) {
      parts.push('--coverage')
    }

    if (this.options.reporter) {
      parts.push(`--reporter=${this.options.reporter}`)
    }

    if (this.options.bail) {
      parts.push('--bail=1')
    }

    if (this.options.timeout) {
      parts.push(`--testTimeout=${this.options.timeout}`)
    }

    if (this.options.watch) {
      parts[0] = 'npx vitest' // Remove 'run' for watch mode
    }

    if (this.options.ui) {
      parts.push('--ui')
    }

    return parts.join(' ')
  }

  private async generateCoverageReport(): Promise<void> {
    console.log('\n📊 Generating coverage report...')
    
    try {
      const { stdout } = await execAsync('npx vitest run --coverage --reporter=json')
      const coverageData = JSON.parse(stdout)
      
      this.analyzeCoverage(coverageData)
    } catch (error) {
      console.warn('⚠️  Could not generate detailed coverage analysis')
    }
  }

  private analyzeCoverage(coverageData: any): void {
    console.log('\n📈 Coverage Analysis:')
    console.log('=====================')

    const summary = coverageData.summary
    if (summary) {
      console.log(`Lines: ${summary.lines?.pct || 0}%`)
      console.log(`Functions: ${summary.functions?.pct || 0}%`)
      console.log(`Branches: ${summary.branches?.pct || 0}%`)
      console.log(`Statements: ${summary.statements?.pct || 0}%`)
    }

    // Identify files with low coverage
    const lowCoverageFiles = Object.entries(coverageData.files || {})
      .filter(([, data]: [string, any]) => data.summary.lines.pct < 80)
      .map(([file]) => file)

    if (lowCoverageFiles.length > 0) {
      console.log('\n🔍 Files with low coverage (< 80%):')
      lowCoverageFiles.forEach(file => {
        const relativeFile = path.relative(process.cwd(), file)
        console.log(`  • ${relativeFile}`)
      })
    }
  }

  static printUsage(): void {
    console.log(`
GTD Frontend Test Runner

Usage: npm run test [options]

Options:
  --suite <name>     Run specific test suite (${TEST_SUITES.map(s => s.name).join(', ')})
  --coverage         Generate coverage report
  --watch           Run tests in watch mode
  --ui              Open test UI
  --reporter <type>  Test reporter (default, verbose, json, junit)
  --bail            Stop on first failure
  --timeout <ms>    Test timeout in milliseconds

Examples:
  npm run test                           # Run all tests
  npm run test -- --suite components    # Run component tests only
  npm run test -- --coverage            # Run all tests with coverage
  npm run test -- --watch               # Run in watch mode
  npm run test -- --ui                  # Open test UI

Test Suites:
${TEST_SUITES.map(s => `  • ${s.name}: ${s.description}`).join('\n')}
`)
  }
}

// Parse command line arguments
function parseArgs(): TestOptions {
  const args = process.argv.slice(2)
  const options: TestOptions = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    switch (arg) {
      case '--help':
      case '-h':
        TestRunner.printUsage()
        process.exit(0)
        break
      case '--suite':
        options.suite = args[++i]
        break
      case '--coverage':
        options.coverage = true
        break
      case '--watch':
        options.watch = true
        break
      case '--ui':
        options.ui = true
        break
      case '--reporter':
        options.reporter = args[++i] as any
        break
      case '--bail':
        options.bail = true
        break
      case '--timeout':
        options.timeout = parseInt(args[++i], 10)
        break
    }
  }

  return options
}

// Main execution
if (require.main === module) {
  const options = parseArgs()
  const runner = new TestRunner(options)
  
  runner.runTests().catch(error => {
    console.error('Test runner failed:', error)
    process.exit(1)
  })
}

export { TestRunner, TEST_SUITES }