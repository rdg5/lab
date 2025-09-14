import { dbManager } from './database';

async function migrate() {
  try {
    console.log('Running database migrations...');
    await dbManager.initialize();
    console.log('Migrations completed successfully');
    await dbManager.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();