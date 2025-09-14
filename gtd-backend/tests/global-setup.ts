import { GlobalSetupContext } from '@jest/types';
import path from 'path';
import fs from 'fs';

export default async function globalSetup(globalConfig: any, projectConfig: GlobalSetupContext) {
  console.log('🚀 Global test setup starting...');
  
  // Ensure test database directory exists
  const testDbDir = path.join(__dirname, 'db');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = path.join(testDbDir, 'test.db');
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use test Redis DB
  
  console.log('✅ Global test setup completed');
}