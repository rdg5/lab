"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalTeardown;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
async function globalTeardown(globalConfig, projectConfig) {
    console.log('🧹 Global test teardown starting...');
    // Clean up test databases
    const testDbDir = path_1.default.join(__dirname, 'db');
    if (fs_1.default.existsSync(testDbDir)) {
        const files = fs_1.default.readdirSync(testDbDir);
        files.forEach(file => {
            if (file.endsWith('.db') || file.endsWith('.db-journal')) {
                fs_1.default.unlinkSync(path_1.default.join(testDbDir, file));
            }
        });
    }
    console.log('✅ Global test teardown completed');
}
//# sourceMappingURL=global-teardown.js.map