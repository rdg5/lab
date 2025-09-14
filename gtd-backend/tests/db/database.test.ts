import { TestDbManager } from '../helpers/test-db';
import { TestDataFactory } from '../helpers/factories';
import { Kysely } from 'kysely';
import type { TestDatabase } from '../helpers/test-db';

describe('Database Schema and Migrations', () => {
  let dbManager: TestDbManager;
  let db: Kysely<TestDatabase>;

  beforeEach(async () => {
    dbManager = new TestDbManager();
    db = await dbManager.setup();
  });

  afterEach(async () => {
    await dbManager.cleanup();
  });

  describe('Schema Creation', () => {
    it('should create all required tables', async () => {
      // These should fail initially since tables don't exist
      const tables = ['users', 'todos', 'subtasks', 'audit_trails', 'sync_metadata'];
      
      for (const table of tables) {
        const result = await db.selectFrom(table as any).selectAll().execute();
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it('should enforce foreign key constraints', async () => {
      // This should fail - trying to insert todo with non-existent user
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo(),
            user_id: 'non-existent-user-id'
          })
          .execute();
      }).rejects.toThrow(); // Should fail due to foreign key constraint
    });

    it('should enforce check constraints on priority', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // This should fail - invalid priority value
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo({ user_id: user.id }),
            priority: 'invalid' as any
          })
          .execute();
      }).rejects.toThrow(); // Should fail due to check constraint
    });

    it('should enforce check constraints on energy_level', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // This should fail - invalid energy level
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo({ user_id: user.id }),
            energy_level: 'extreme' as any
          })
          .execute();
      }).rejects.toThrow(); // Should fail due to check constraint
    });

    it('should enforce GTD quality score range constraints', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // This should fail - quality score out of range
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo({ user_id: user.id }),
            gtd_quality_score: 1.5 // Above maximum of 1.0
          })
          .execute();
      }).rejects.toThrow(); // Should fail due to check constraint

      // This should also fail - negative quality score
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo({ user_id: user.id }),
            gtd_quality_score: -0.1 // Below minimum of 0.0
          })
          .execute();
      }).rejects.toThrow(); // Should fail due to check constraint
    });
  });

  describe('Index Performance', () => {
    it('should have performance indexes on todos table', async () => {
      // This test would check if indexes exist, but since they don't exist yet, it should fail
      const indexQuery = `
        SELECT name FROM sqlite_master 
        WHERE type='index' 
        AND tbl_name='todos' 
        AND name LIKE 'idx_%'
      `;
      
      // This should fail - no custom indexes exist yet
      const result = await db.executeQuery({
        sql: indexQuery,
        parameters: []
      });
      
      const indexNames = result.rows.map((row: any) => row.name);
      expect(indexNames).toContain('idx_todos_user_id');
      expect(indexNames).toContain('idx_todos_completed');
      expect(indexNames).toContain('idx_todos_due_date');
      expect(indexNames).toContain('idx_todos_priority');
      expect(indexNames).toContain('idx_todos_gtd_quality');
    });

    it('should have performance indexes on subtasks table', async () => {
      const indexQuery = `
        SELECT name FROM sqlite_master 
        WHERE type='index' 
        AND tbl_name='subtasks' 
        AND name LIKE 'idx_%'
      `;
      
      const result = await db.executeQuery({
        sql: indexQuery,
        parameters: []
      });
      
      const indexNames = result.rows.map((row: any) => row.name);
      expect(indexNames).toContain('idx_subtasks_todo_id');
      expect(indexNames).toContain('idx_subtasks_order');
    });
  });

  describe('Data Integrity', () => {
    it('should cascade delete todos when user is deleted', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const todo = TestDataFactory.createTodo({ user_id: user.id });
      await db.insertInto('todos').values(todo).execute();

      // Delete user
      await db.deleteFrom('users').where('id', '=', user.id).execute();

      // Todo should be cascade deleted
      const remainingTodos = await db
        .selectFrom('todos')
        .where('id', '=', todo.id)
        .selectAll()
        .execute();

      expect(remainingTodos).toHaveLength(0);
    });

    it('should cascade delete subtasks when todo is deleted', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const todo = TestDataFactory.createTodo({ user_id: user.id });
      await db.insertInto('todos').values(todo).execute();

      const subtask = TestDataFactory.createSubtask({ todo_id: todo.id });
      await db.insertInto('subtasks').values(subtask).execute();

      // Delete todo
      await db.deleteFrom('todos').where('id', '=', todo.id).execute();

      // Subtask should be cascade deleted
      const remainingSubtasks = await db
        .selectFrom('subtasks')
        .where('id', '=', subtask.id)
        .selectAll()
        .execute();

      expect(remainingSubtasks).toHaveLength(0);
    });

    it('should enforce unique email constraint', async () => {
      const user1 = TestDataFactory.createUser({ email: 'duplicate@example.com' });
      await db.insertInto('users').values(user1).execute();

      const user2 = TestDataFactory.createUser({ email: 'duplicate@example.com' });
      
      // This should fail - duplicate email
      await expect(async () => {
        await db.insertInto('users').values(user2).execute();
      }).rejects.toThrow(); // Should fail due to unique constraint
    });

    it('should enforce unique provider+provider_id constraint', async () => {
      const user1 = TestDataFactory.createUser({ 
        provider: 'google', 
        provider_id: 'google-123' 
      });
      await db.insertInto('users').values(user1).execute();

      const user2 = TestDataFactory.createUser({ 
        provider: 'google', 
        provider_id: 'google-123',
        email: 'different@example.com'
      });
      
      // This should fail - duplicate provider+provider_id
      await expect(async () => {
        await db.insertInto('users').values(user2).execute();
      }).rejects.toThrow(); // Should fail due to unique constraint
    });
  });

  describe('GTD Business Logic Constraints', () => {
    it('should require non-empty outcome for todos', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // This should fail - empty outcome
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo({ user_id: user.id }),
            outcome: '' // Empty outcome should fail
          })
          .execute();
      }).rejects.toThrow();
    });

    it('should require non-empty next_action for todos', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // This should fail - empty next action
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo({ user_id: user.id }),
            next_action: '' // Empty next action should fail
          })
          .execute();
      }).rejects.toThrow();
    });

    it('should validate vector clock JSON format', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      // This should fail - invalid JSON in vector_clock
      await expect(async () => {
        await db.insertInto('todos')
          .values({
            ...TestDataFactory.createTodo({ user_id: user.id }),
            vector_clock: 'invalid-json' // Invalid JSON should fail
          })
          .execute();
      }).rejects.toThrow();
    });
  });

  describe('Audit Trail Requirements', () => {
    it('should support all required entity types in audit trails', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const validEntityTypes = ['todo', 'subtask', 'user'];
      
      for (const entityType of validEntityTypes) {
        const audit = TestDataFactory.createAuditTrail({
          entity_type: entityType as any,
          user_id: user.id
        });
        
        // These should not fail for valid entity types
        await db.insertInto('audit_trails').values(audit).execute();
      }

      // This should fail - invalid entity type
      await expect(async () => {
        const invalidAudit = TestDataFactory.createAuditTrail({
          entity_type: 'invalid' as any,
          user_id: user.id
        });
        await db.insertInto('audit_trails').values(invalidAudit).execute();
      }).rejects.toThrow(); // Should fail due to check constraint
    });

    it('should support all required action types in audit trails', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const validActions = ['create', 'update', 'delete', 'complete', 'uncomplete'];
      
      for (const action of validActions) {
        const audit = TestDataFactory.createAuditTrail({
          action: action as any,
          user_id: user.id
        });
        
        await db.insertInto('audit_trails').values(audit).execute();
      }

      // This should fail - invalid action
      await expect(async () => {
        const invalidAudit = TestDataFactory.createAuditTrail({
          action: 'invalid' as any,
          user_id: user.id
        });
        await db.insertInto('audit_trails').values(invalidAudit).execute();
      }).rejects.toThrow(); // Should fail due to check constraint
    });
  });

  describe('Sync Metadata Requirements', () => {
    it('should enforce unique sync metadata per user/device/entity combination', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const sync1 = TestDataFactory.createSyncMetadata({
        user_id: user.id,
        device_id: 'device-123',
        entity_type: 'todo',
        entity_id: 'todo-456'
      });
      
      await db.insertInto('sync_metadata').values(sync1).execute();

      // This should fail - duplicate sync metadata for same combination
      const sync2 = TestDataFactory.createSyncMetadata({
        user_id: user.id,
        device_id: 'device-123',
        entity_type: 'todo',
        entity_id: 'todo-456'
      });

      await expect(async () => {
        await db.insertInto('sync_metadata').values(sync2).execute();
      }).rejects.toThrow(); // Should fail due to unique constraint
    });

    it('should validate conflict resolution types', async () => {
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const validResolutions = ['manual', 'auto_merge', 'latest_wins', null];
      
      for (const resolution of validResolutions) {
        const sync = TestDataFactory.createSyncMetadata({
          user_id: user.id,
          device_id: `device-${Math.random()}`,
          conflict_resolution: resolution as any
        });
        
        await db.insertInto('sync_metadata').values(sync).execute();
      }

      // This should fail - invalid conflict resolution
      await expect(async () => {
        const invalidSync = TestDataFactory.createSyncMetadata({
          user_id: user.id,
          device_id: 'device-invalid',
          conflict_resolution: 'invalid' as any
        });
        await db.insertInto('sync_metadata').values(invalidSync).execute();
      }).rejects.toThrow(); // Should fail due to check constraint
    });
  });
});