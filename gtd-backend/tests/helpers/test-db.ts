import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

export interface TestDatabase {
  users: {
    id: string;
    email: string;
    name: string;
    avatar_url: string | null;
    provider: 'google' | 'github';
    provider_id: string;
    created_at: Date;
    updated_at: Date;
  };
  
  todos: {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    outcome: string;
    next_action: string;
    context: string | null;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    energy_level: 'low' | 'medium' | 'high';
    time_estimate: number | null; // minutes
    due_date: Date | null;
    completed: boolean;
    clarified: boolean;
    gtd_quality_score: number;
    vector_clock: string; // JSON string of vector clock
    last_modified_device: string;
    created_at: Date;
    updated_at: Date;
  };
  
  subtasks: {
    id: string;
    todo_id: string;
    title: string;
    description: string | null;
    outcome: string;
    next_action: string;
    order_index: number;
    completed: boolean;
    gtd_quality_score: number;
    created_at: Date;
    updated_at: Date;
  };
  
  audit_trails: {
    id: string;
    entity_type: 'todo' | 'subtask' | 'user';
    entity_id: string;
    action: 'create' | 'update' | 'delete' | 'complete' | 'uncomplete';
    user_id: string;
    old_values: string | null; // JSON
    new_values: string; // JSON
    device_id: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
  };
  
  sync_metadata: {
    id: string;
    user_id: string;
    device_id: string;
    entity_type: 'todo' | 'subtask';
    entity_id: string;
    vector_clock: string; // JSON
    last_sync: Date;
    conflict_resolution: 'manual' | 'auto_merge' | 'latest_wins' | null;
    created_at: Date;
    updated_at: Date;
  };
}

export class TestDbManager {
  private db: Database.Database | null = null;
  private kysely: Kysely<TestDatabase> | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(__dirname, '..', 'db', `test-${randomUUID()}.db`);
  }

  async setup(): Promise<Kysely<TestDatabase>> {
    // Ensure directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.kysely = new Kysely<TestDatabase>({
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
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
        provider_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_id)
      );
    `);

    // Todos table
    this.db.exec(`
      CREATE TABLE todos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        outcome TEXT NOT NULL,
        next_action TEXT NOT NULL,
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
        vector_clock TEXT NOT NULL,
        last_modified_device TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // Subtasks table
    this.db.exec(`
      CREATE TABLE subtasks (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        outcome TEXT NOT NULL,
        next_action TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        gtd_quality_score REAL NOT NULL DEFAULT 0.0
          CHECK (gtd_quality_score >= 0.0 AND gtd_quality_score <= 1.0),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE
      );
    `);

    // Audit trails table
    this.db.exec(`
      CREATE TABLE audit_trails (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('todo', 'subtask', 'user')),
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'complete', 'uncomplete')),
        user_id TEXT NOT NULL,
        old_values TEXT,
        new_values TEXT NOT NULL,
        device_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // Sync metadata table
    this.db.exec(`
      CREATE TABLE sync_metadata (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('todo', 'subtask')),
        entity_id TEXT NOT NULL,
        vector_clock TEXT NOT NULL,
        last_sync DATETIME NOT NULL,
        conflict_resolution TEXT CHECK (conflict_resolution IN ('manual', 'auto_merge', 'latest_wins')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, device_id, entity_type, entity_id)
      );
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX idx_todos_user_id ON todos(user_id);
      CREATE INDEX idx_todos_completed ON todos(completed);
      CREATE INDEX idx_todos_due_date ON todos(due_date);
      CREATE INDEX idx_todos_priority ON todos(priority);
      CREATE INDEX idx_todos_gtd_quality ON todos(gtd_quality_score);
      
      CREATE INDEX idx_subtasks_todo_id ON subtasks(todo_id);
      CREATE INDEX idx_subtasks_order ON subtasks(todo_id, order_index);
      
      CREATE INDEX idx_audit_entity ON audit_trails(entity_type, entity_id);
      CREATE INDEX idx_audit_user ON audit_trails(user_id);
      CREATE INDEX idx_audit_created ON audit_trails(created_at);
      
      CREATE INDEX idx_sync_user_device ON sync_metadata(user_id, device_id);
      CREATE INDEX idx_sync_entity ON sync_metadata(entity_type, entity_id);
    `);
  }

  getKysely(): Kysely<TestDatabase> {
    if (!this.kysely) {
      throw new Error('Database not initialized. Call setup() first.');
    }
    return this.kysely;
  }

  async cleanup(): Promise<void> {
    if (this.kysely) {
      await this.kysely.destroy();
      this.kysely = null;
    }
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }

    // Also clean up journal file if it exists
    const journalPath = `${this.dbPath}-journal`;
    if (fs.existsSync(journalPath)) {
      fs.unlinkSync(journalPath);
    }
  }
}