import type { Todo, Subtask } from './database';

export interface CreateTodoInput {
  title: string;
  description?: string;
  outcome?: string;
  next_action?: string;
  context?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  energy_level?: 'low' | 'medium' | 'high';
  time_estimate?: number;
  due_date?: Date;
  device_id: string;
}

export interface UpdateTodoInput {
  id: string;
  title?: string;
  description?: string;
  outcome?: string;
  next_action?: string;
  context?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  energy_level?: 'low' | 'medium' | 'high';
  time_estimate?: number;
  due_date?: Date;
  completed?: boolean;
  device_id: string;
}

export interface CreateSubtaskInput {
  todo_id: string;
  title: string;
  description?: string;
  outcome?: string;
  next_action?: string;
  order_index?: number;
  device_id: string;
}

export interface UpdateSubtaskInput {
  id: string;
  title?: string;
  description?: string;
  outcome?: string;
  next_action?: string;
  order_index?: number;
  completed?: boolean;
  device_id: string;
}

export interface TodoWithSubtasks extends Todo {
  subtasks: Subtask[];
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
}

export interface TodoFilters {
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  energy_level?: 'low' | 'medium' | 'high';
  context?: string;
  due_before?: Date;
  due_after?: Date;
  search?: string;
}