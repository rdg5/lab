import { GTDTodo, GTDSubtask } from '../test/utils/test-utils'

export interface TodoFilters {
  status?: 'inbox' | 'next' | 'waiting' | 'someday' | 'completed' | 'reference'
  context?: string
  project?: string
  sortBy?: 'title' | 'createdAt' | 'updatedAt' | 'dueDate' | 'priority'
  sortOrder?: 'asc' | 'desc'
  groupBy?: 'status' | 'project' | 'context' | 'priority'
  includeStats?: boolean
}

export interface CreateTodoData {
  title: string
  description?: string
  outcome?: string
  nextAction?: string
  context?: string[]
  project?: string
  status: 'inbox' | 'next' | 'waiting' | 'someday' | 'completed' | 'reference'
  priority?: 'low' | 'medium' | 'high'
  dueDate?: string
  tags?: string[]
  estimatedMinutes?: number
  energy?: 'low' | 'medium' | 'high'
}

export interface UpdateTodoData {
  title?: string
  description?: string
  outcome?: string
  nextAction?: string
  context?: string[]
  project?: string
  status?: 'inbox' | 'next' | 'waiting' | 'someday' | 'completed' | 'reference'
  priority?: 'low' | 'medium' | 'high'
  dueDate?: string
  tags?: string[]
  estimatedMinutes?: number
  actualMinutes?: number
  energy?: 'low' | 'medium' | 'high'
}

export interface CreateSubtaskData {
  title: string
  description?: string
  completed: boolean
  estimatedMinutes?: number
}

export interface UpdateSubtaskData {
  title?: string
  description?: string
  completed?: boolean
  actualMinutes?: number
}

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3000/api'

class ApiServiceClass {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return response.json()
  }

  async getTodos(filters?: TodoFilters): Promise<GTDTodo[]> {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value))
        }
      })
    }
    
    const endpoint = `/todos${params.toString() ? `?${params.toString()}` : ''}`
    return this.request<GTDTodo[]>(endpoint)
  }

  async createTodo(data: CreateTodoData): Promise<GTDTodo> {
    return this.request<GTDTodo>('/todos', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTodo(id: string, data: UpdateTodoData): Promise<GTDTodo> {
    return this.request<GTDTodo>(`/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteTodo(id: string): Promise<void> {
    return this.request<void>(`/todos/${id}`, {
      method: 'DELETE',
    })
  }

  async createSubtask(todoId: string, data: CreateSubtaskData): Promise<GTDSubtask> {
    return this.request<GTDSubtask>(`/todos/${todoId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateSubtask(todoId: string, subtaskId: string, data: UpdateSubtaskData): Promise<GTDSubtask> {
    return this.request<GTDSubtask>(`/todos/${todoId}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteSubtask(todoId: string, subtaskId: string): Promise<void> {
    return this.request<void>(`/todos/${todoId}/subtasks/${subtaskId}`, {
      method: 'DELETE',
    })
  }

  async reorderTodos(todoIds: string[]): Promise<void> {
    return this.request<void>('/todos/reorder', {
      method: 'POST',
      body: JSON.stringify({ todoIds }),
    })
  }
}

export const ApiService = new ApiServiceClass()