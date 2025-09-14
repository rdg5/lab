#!/usr/bin/env node

/**
 * Comprehensive Test Runner for GTD Backend
 * 
 * This script runs all failing tests in the correct order and provides
 * detailed output for TDD development.
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const testCategories = {
  database: {
    name: 'Database Schema & Migrations',
    pattern: 'tests/db/**/*.test.ts',
    description: 'Tests database schema, constraints, and migrations',
  },
  security: {
    name: 'Security & Validation',
    pattern: 'tests/security/**/*.test.ts',
    description: 'Tests input validation, rate limiting, and security measures',
  },
  services: {
    name: 'Service Layer',
    pattern: 'tests/services/**/*.test.ts',
    description: 'Tests GTD enforcement, LLM integration, and business logic',
  },
  api: {
    name: 'API Endpoints',
    pattern: 'tests/api/**/*.test.ts',
    description: 'Tests tRPC procedures, authentication, and CRUD operations',
  },
  jobs: {
    name: 'Background Jobs',
    pattern: 'tests/background-jobs/**/*.test.ts',
    description: 'Tests LLM processing, conflict resolution, and queue management',
  },
};

class TestRunner {
  constructor() {
    this.results = {};
    this.totalTests = 0;
    this.totalFailures = 0;
  }

  async runCategory(category, config) {
    console.log(`\n🧪 Running ${config.name} Tests`);
    console.log(`📝 ${config.description}`);
    console.log('━'.repeat(60));

    return new Promise((resolve) => {
      const cmd = `npm test -- "${config.pattern}" --verbose --no-cache`;
      const child = exec(cmd, { cwd: process.cwd() });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data;
        process.stdout.write(data);
      });

      child.stderr.on('data', (data) => {
        errorOutput += data;
        process.stderr.write(data);
      });

      child.on('close', (code) => {
        const result = {
          category,
          name: config.name,
          exitCode: code,
          output,
          errorOutput,
          passed: code === 0,
        };

        this.results[category] = result;
        
        if (code === 0) {
          console.log(`✅ ${config.name} tests completed successfully`);
        } else {
          console.log(`❌ ${config.name} tests failed (expected in TDD)`);
          this.totalFailures++;
        }

        this.totalTests++;
        resolve(result);
      });
    });
  }

  async runAllTests() {
    console.log('🚀 Starting GTD Backend Test Suite (TDD Mode)');
    console.log('📋 These tests are designed to FAIL initially (Red phase of TDD)');
    console.log('🎯 Use these failures to guide your implementation\n');

    const startTime = Date.now();

    // Run tests in logical order
    for (const [category, config] of Object.entries(testCategories)) {
      await this.runCategory(category, config);
      
      // Small delay between categories for readability
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    this.printSummary(duration);
    this.generateReports();
  }

  printSummary(duration) {
    console.log('\n');
    console.log('═'.repeat(80));
    console.log('📊 TEST SUITE SUMMARY');
    console.log('═'.repeat(80));

    console.log(`⏱️  Total execution time: ${duration.toFixed(2)}s`);
    console.log(`📂 Test categories run: ${this.totalTests}`);
    console.log(`❌ Categories with failures: ${this.totalFailures} (Expected in TDD!)`);
    console.log(`✅ Categories passing: ${this.totalTests - this.totalFailures}`);

    console.log('\n📋 CATEGORY RESULTS:');
    for (const [category, result] of Object.entries(this.results)) {
      const status = result.passed ? '✅' : '❌';
      console.log(`  ${status} ${result.name}`);
    }

    if (this.totalFailures === this.totalTests) {
      console.log('\n🎯 PERFECT! All tests are failing as expected for TDD.');
      console.log('   Now you can start implementing to make them pass!');
    } else if (this.totalFailures > 0) {
      console.log('\n⚠️  Some tests are passing - this might indicate:');
      console.log('   • Partial implementation already exists');
      console.log('   • Tests need to be more comprehensive');
      console.log('   • Some infrastructure is already in place');
    } else {
      console.log('\n🤔 All tests are passing - this is unexpected for TDD setup.');
      console.log('   You might want to review the test coverage.');
    }

    console.log('\n📚 NEXT STEPS:');
    console.log('1. Review failing tests to understand requirements');
    console.log('2. Implement minimal code to make first test pass (Green phase)');
    console.log('3. Refactor code while keeping tests green (Refactor phase)');
    console.log('4. Repeat for each failing test');

    console.log('\n📁 Find detailed test output in: ./test-reports/');
  }

  generateReports() {
    // Create reports directory
    const reportsDir = path.join(process.cwd(), 'test-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate summary report
    const summaryReport = {
      timestamp: new Date().toISOString(),
      totalCategories: this.totalTests,
      failingCategories: this.totalFailures,
      passingCategories: this.totalTests - this.totalFailures,
      results: this.results,
    };

    fs.writeFileSync(
      path.join(reportsDir, 'summary.json'),
      JSON.stringify(summaryReport, null, 2)
    );

    // Generate markdown report
    let markdownReport = `# GTD Backend Test Suite Report\n\n`;
    markdownReport += `**Generated:** ${new Date().toISOString()}\n\n`;
    markdownReport += `## Summary\n\n`;
    markdownReport += `- **Total Categories:** ${this.totalTests}\n`;
    markdownReport += `- **Failing Categories:** ${this.totalFailures} ❌\n`;
    markdownReport += `- **Passing Categories:** ${this.totalTests - this.totalFailures} ✅\n\n`;
    
    markdownReport += `## Test Categories\n\n`;
    
    for (const [category, result] of Object.entries(this.results)) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      markdownReport += `### ${result.name} ${status}\n\n`;
      markdownReport += `**Pattern:** \`${testCategories[category].pattern}\`\n\n`;
      markdownReport += `**Description:** ${testCategories[category].description}\n\n`;
      
      if (!result.passed) {
        markdownReport += `**Exit Code:** ${result.exitCode}\n\n`;
        markdownReport += `<details>\n<summary>Click to see error output</summary>\n\n`;
        markdownReport += `\`\`\`\n${result.errorOutput.slice(0, 2000)}${result.errorOutput.length > 2000 ? '...' : ''}\n\`\`\`\n\n`;
        markdownReport += `</details>\n\n`;
      }
    }

    markdownReport += `## Implementation Guidelines\n\n`;
    markdownReport += `This test suite follows Test-Driven Development (TDD) principles:\n\n`;
    markdownReport += `1. **Red Phase:** Tests fail because implementation doesn't exist yet ❌\n`;
    markdownReport += `2. **Green Phase:** Write minimal code to make tests pass ✅\n`;
    markdownReport += `3. **Refactor Phase:** Improve code while keeping tests green 🔄\n\n`;
    
    markdownReport += `### Key Features to Implement\n\n`;
    markdownReport += `- **tRPC API:** Authentication, todos CRUD, real-time subscriptions\n`;
    markdownReport += `- **GTD Enforcement:** Outcome validation, next action clarity, quality scoring\n`;
    markdownReport += `- **LLM Integration:** Todo analysis, subtask decomposition, quality improvement\n`;
    markdownReport += `- **Security:** Rate limiting, input validation, audit trails\n`;
    markdownReport += `- **Background Jobs:** Queue processing, conflict resolution, re-evaluation\n`;
    markdownReport += `- **Database:** SQLite with Kysely, vector clocks, sync metadata\n\n`;

    fs.writeFileSync(
      path.join(reportsDir, 'report.md'),
      markdownReport
    );

    console.log('📄 Reports generated:');
    console.log(`   • ${path.join(reportsDir, 'summary.json')}`);
    console.log(`   • ${path.join(reportsDir, 'report.md')}`);
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.runAllTests().catch(console.error);
}

module.exports = TestRunner;