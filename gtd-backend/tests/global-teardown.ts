import { GlobalTeardownContext } from '@jest/types';
import path from 'path';
import fs from 'fs';

export default async function globalTeardown(globalConfig: any, projectConfig: GlobalTeardownContext) {
  console.log('🧹 Global test teardown starting...');
  
  // Clean up test databases
  const testDbDir = path.join(__dirname, 'db');
  if (fs.existsSync(testDbDir)) {
    const files = fs.readdirSync(testDbDir);
    files.forEach(file => {
      if (file.endsWith('.db') || file.endsWith('.db-journal')) {
        fs.unlinkSync(path.join(testDbDir, file));
      }
    });
  }
  
  console.log('✅ Global test teardown completed');
}