import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  users: UsersTable;
  todos: TodosTable;
  subtasks: SubtasksTable;
  audit_trails: AuditTrailsTable;
  sync_metadata: SyncMetadataTable;
}

export interface UsersTable {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  provider: 'google' | 'github';
  provider_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TodosTable {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  outcome: string;
  next_action: string;
  context: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  energy_level: 'low' | 'medium' | 'high';
  time_estimate: number | null;
  due_date: Date | null;
  completed: Generated<boolean>;
  clarified: Generated<boolean>;
  gtd_quality_score: Generated<number>;
  vector_clock: string;
  last_modified_device: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SubtasksTable {
  id: string;
  todo_id: string;
  title: string;
  description: string | null;
  outcome: string;
  next_action: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  energy_level: 'low' | 'medium' | 'high';
  time_estimate: number | null;
  completed: Generated<boolean>;
  clarified: Generated<boolean>;
  gtd_quality_score: Generated<number>;
  vector_clock: string;
  last_modified_device: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuditTrailsTable {
  id: string;
  entity_type: 'user' | 'todo' | 'subtask';
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'complete' | 'clarify';
  user_id: string;
  old_values: string | null;
  new_values: string;
  device_id: string;
  vector_clock: string;
  created_at: Generated<Date>;
}

export interface SyncMetadataTable {
  id: string;
  entity_type: 'todo' | 'subtask';
  entity_id: string;
  user_id: string;
  device_id: string;
  vector_clock: string;
  checksum: string;
  conflict_resolution: 'merge' | 'last_write_wins' | 'manual';
  resolved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Todo = Selectable<TodosTable>;
export type NewTodo = Insertable<TodosTable>;
export type TodoUpdate = Updateable<TodosTable>;

export type Subtask = Selectable<SubtasksTable>;
export type NewSubtask = Insertable<SubtasksTable>;
export type SubtaskUpdate = Updateable<SubtasksTable>;

export type AuditTrail = Selectable<AuditTrailsTable>;
export type NewAuditTrail = Insertable<AuditTrailsTable>;

export type SyncMetadata = Selectable<SyncMetadataTable>;
export type NewSyncMetadata = Insertable<SyncMetadataTable>;
export type SyncMetadataUpdate = Updateable<SyncMetadataTable>;