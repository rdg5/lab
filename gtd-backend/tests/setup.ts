import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';

// Load test environment variables
config({ path: path.join(__dirname, '..', '.env.test') });

// Global test setup
beforeAll(async () => {
  // Clean up any existing test databases
  const testDbPath = path.join(__dirname, 'test.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

afterAll(async () => {
  // Clean up test databases after all tests
  const testDbPath = path.join(__dirname, 'test.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidGTDTask(): R;
      toHaveValidOutcome(): R;
      toHaveValidNextAction(): R;
    }
  }
}

// Custom matchers for GTD validation
expect.extend({
  toBeValidGTDTask(received: any) {
    const pass = received &&
      typeof received === 'object' &&
      received.outcome &&
      received.nextAction &&
      received.clarified === true;

    return {
      message: () => `expected ${received} to be a valid GTD task`,
      pass,
    };
  },

  toHaveValidOutcome(received: any) {
    const pass = received &&
      received.outcome &&
      typeof received.outcome === 'string' &&
      received.outcome.length > 10 &&
      received.outcome.includes('success looks like');

    return {
      message: () => `expected ${received} to have a valid outcome definition`,
      pass,
    };
  },

  toHaveValidNextAction(received: any) {
    const pass = received &&
      received.nextAction &&
      typeof received.nextAction === 'string' &&
      received.nextAction.length > 5 &&
      received.nextAction.match(/^[A-Z][a-z]/); // Starts with capital letter

    return {
      message: () => `expected ${received} to have a valid next action`,
      pass,
    };
  },
});