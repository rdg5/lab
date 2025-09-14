import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import path from 'path';
import fs from 'fs';
import type { Database as DatabaseSchema } from '../types/database.js';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private kysely: Kysely<DatabaseSchema> | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'gtd.db');
  }

  async initialize(): Promise<Kysely<DatabaseSchema>> {
    // Ensure directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.kysely = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({
        database: this.db,
      }),
    });

    await this.runMigrations();
    return this.kysely;
  }

  async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL CHECK(email != ''),
        name TEXT NOT NULL CHECK(name != ''),
        avatar_url TEXT,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
        provider_id TEXT NOT NULL CHECK(provider_id != ''),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_id)
      );
    `);

    // Todos table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL CHECK(title != ''),
        description TEXT,
        outcome TEXT NOT NULL CHECK(outcome != ''),
        next_action TEXT NOT NULL CHECK(next_action != ''),
        context TEXT,
        priority TEXT NOT NULL DEFAULT 'medium' 
          CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        energy_level TEXT NOT NULL DEFAULT 'medium'
          CHECK (energy_level IN ('low', 'medium', 'high')),
        time_estimate INTEGER,
        due_date DATETIME,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        clarified BOOLEAN NOT NULL DEFAULT FALSE,
        gtd_quality_score REAL NOT NULL DEFAULT 0.0 
          CHECK (gtd_quality_score >= 0.0 AND gtd_quality_score <= 1.0),
        vector_clock TEXT NOT NULL CHECK(json_valid(vector_clock)),
        last_modified_device TEXT NOT NULL CHECK(last_modified_device != ''),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // Subtasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subtasks (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        title TEXT NOT NULL CHECK(title != ''),
        description TEXT,
        outcome TEXT NOT NULL CHECK(outcome != ''),
        next_action TEXT NOT NULL CHECK(next_action != ''),
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        energy_level TEXT NOT NULL DEFAULT 'medium'
          CHECK (energy_level IN ('low', 'medium', 'high')),
        time_estimate INTEGER,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        clarified BOOLEAN NOT NULL DEFAULT FALSE,
        gtd_quality_score REAL NOT NULL DEFAULT 0.0
          CHECK (gtd_quality_score >= 0.0 AND gtd_quality_score <= 1.0),
        vector_clock TEXT NOT NULL CHECK(json_valid(vector_clock)),
        last_modified_device TEXT NOT NULL CHECK(last_modified_device != ''),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE
      );
    `);

    // Audit trails table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_trails (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'todo', 'subtask')),
        entity_id TEXT NOT NULL CHECK(entity_id != ''),
        action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'complete', 'clarify')),
        user_id TEXT NOT NULL,
        old_values TEXT CHECK(old_values IS NULL OR json_valid(old_values)),
        new_values TEXT NOT NULL CHECK(json_valid(new_values)),
        device_id TEXT NOT NULL CHECK(device_id != ''),
        vector_clock TEXT NOT NULL CHECK(json_valid(vector_clock)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // Sync metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('todo', 'subtask')),
        entity_id TEXT NOT NULL CHECK(entity_id != ''),
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL CHECK(device_id != ''),
        vector_clock TEXT NOT NULL CHECK(json_valid(vector_clock)),
        checksum TEXT NOT NULL CHECK(checksum != ''),
        conflict_resolution TEXT CHECK (conflict_resolution IN ('merge', 'last_write_wins', 'manual')),
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(entity_type, entity_id, device_id)
      );
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
      CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
      CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
      CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
      CREATE INDEX IF NOT EXISTS idx_todos_gtd_quality ON todos(gtd_quality_score);
      
      CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
      CREATE INDEX IF NOT EXISTS idx_subtasks_order ON subtasks(todo_id, order_index);
      
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_trails(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_trails(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_trails(created_at);
      
      CREATE INDEX IF NOT EXISTS idx_sync_user_device ON sync_metadata(user_id, device_id);
      CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_metadata(entity_type, entity_id);
    `);
  }

  getKysely(): Kysely<DatabaseSchema> {
    if (!this.kysely) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.kysely;
  }

  async close(): Promise<void> {
    if (this.kysely) {
      await this.kysely.destroy();
      this.kysely = null;
    }
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
export const dbManager = new DatabaseManager();
export const getDb = () => dbManager.getKysely();