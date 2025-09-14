"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = require("dotenv");
// Load test environment variables
(0, dotenv_1.config)({ path: path_1.default.join(__dirname, '..', '.env.test') });
// Global test setup
beforeAll(async () => {
    // Clean up any existing test databases
    const testDbPath = path_1.default.join(__dirname, 'test.db');
    if (fs_1.default.existsSync(testDbPath)) {
        fs_1.default.unlinkSync(testDbPath);
    }
});
afterAll(async () => {
    // Clean up test databases after all tests
    const testDbPath = path_1.default.join(__dirname, 'test.db');
    if (fs_1.default.existsSync(testDbPath)) {
        fs_1.default.unlinkSync(testDbPath);
    }
});
// Custom matchers for GTD validation
expect.extend({
    toBeValidGTDTask(received) {
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
    toHaveValidOutcome(received) {
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
    toHaveValidNextAction(received) {
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
//# sourceMappingURL=setup.js.map