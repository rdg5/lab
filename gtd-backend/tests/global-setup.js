"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalSetup;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
async function globalSetup(globalConfig, projectConfig) {
    console.log('🚀 Global test setup starting...');
    // Ensure test database directory exists
    const testDbDir = path_1.default.join(__dirname, 'db');
    if (!fs_1.default.existsSync(testDbDir)) {
        fs_1.default.mkdirSync(testDbDir, { recursive: true });
    }
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = path_1.default.join(testDbDir, 'test.db');
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use test Redis DB
    console.log('✅ Global test setup completed');
}
//# sourceMappingURL=global-setup.js.map