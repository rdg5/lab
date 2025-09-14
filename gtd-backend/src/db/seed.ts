import { dbManager } from './database';
import { randomUUID } from 'crypto';

async function seed() {
  try {
    console.log('Seeding database...');
    const db = await dbManager.initialize();

    // Create sample user
    const userId = randomUUID();
    await db.insertInto('users').values({
      id: userId,
      email: 'demo@example.com',
      name: 'Demo User',
      avatar_url: null,
      provider: 'google',
      provider_id: 'google-demo-123',
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    // Create sample todos
    const todoIds = [randomUUID(), randomUUID()];
    
    await db.insertInto('todos').values([
      {
        id: todoIds[0],
        user_id: userId,
        title: 'Set up project development environment',
        description: 'Configure all necessary tools and dependencies for the project',
        outcome: 'Success looks like having a fully functional development environment where I can run and test the application',
        next_action: 'Install Node.js and npm dependencies from package.json',
        context: '@computer',
        priority: 'high',
        energy_level: 'high',
        time_estimate: 60,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        completed: false,
        clarified: true,
        gtd_quality_score: 0.92,
        vector_clock: JSON.stringify({ [userId]: 1 }),
        last_modified_device: 'demo-device',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: todoIds[1],
        user_id: userId,
        title: 'Write project documentation',
        description: 'Create comprehensive documentation for the GTD backend system',
        outcome: 'Success looks like having clear, comprehensive documentation that enables other developers to understand and contribute to the project',
        next_action: 'Open a new markdown file and create the project structure outline',
        context: '@computer',
        priority: 'medium',
        energy_level: 'medium',
        time_estimate: 120,
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
        completed: false,
        clarified: true,
        gtd_quality_score: 0.88,
        vector_clock: JSON.stringify({ [userId]: 1 }),
        last_modified_device: 'demo-device',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]).execute();

    // Create sample subtasks for first todo
    await db.insertInto('subtasks').values([
      {
        id: randomUUID(),
        todo_id: todoIds[0],
        title: 'Install Node.js and npm',
        description: null,
        outcome: 'Success looks like having Node.js and npm installed and working',
        next_action: 'Download and install Node.js from official website',
        order_index: 0,
        completed: false,
        gtd_quality_score: 0.90,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        todo_id: todoIds[0],
        title: 'Install project dependencies',
        description: null,
        outcome: 'Success looks like all npm packages installed without errors',
        next_action: 'Run npm install in the project directory',
        order_index: 1,
        completed: false,
        gtd_quality_score: 0.85,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]).execute();

    console.log('Database seeded successfully');
    await dbManager.close();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();