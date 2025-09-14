import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTodos } from '../useTodos'
import { createMockTodo, createMockSubtask } from '../../test/utils/test-utils'

// Mock API service
vi.mock('../../services/api.service', () => ({
  ApiService: {
    getTodos: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    createSubtask: vi.fn(),
    updateSubtask: vi.fn(),
    deleteSubtask: vi.fn(),
    reorderTodos: vi.fn(),
  },
}))

// Mock WebSocket hook
vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connected: true,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useTodos Hook', () => {
  const mockTodos = [
    createMockTodo({ id: '1', title: 'Todo 1', status: 'inbox' }),
    createMockTodo({ id: '2', title: 'Todo 2', status: 'next' }),
    createMockTodo({ id: '3', title: 'Todo 3', status: 'completed' }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Data Fetching', () => {
    it('should fetch todos on mount', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(ApiService.getTodos).toHaveBeenCalled()
      expect(result.current.todos).toEqual(mockTodos)
    })

    it('should handle loading states', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockTodos), 100))
      )

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.todos).toEqual([])

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.todos).toEqual(mockTodos)
    })

    it('should handle error states', async () => {
      const { ApiService } = await import('../../services/api.service')
      const error = new Error('Failed to fetch todos')
      ApiService.getTodos.mockRejectedValue(error)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.error).toEqual(error)
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.todos).toEqual([])
    })

    it('should fetch with filters', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos({
        status: 'inbox',
        context: '@computer',
        project: 'Test Project',
      }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(ApiService.getTodos).toHaveBeenCalledWith({
        status: 'inbox',
        context: '@computer',
        project: 'Test Project',
      })
    })

    it('should refetch when filters change', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result, rerender } = renderHook(
        ({ filters }) => useTodos(filters),
        {
          wrapper: createWrapper(),
          initialProps: { filters: { status: 'inbox' } },
        }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(ApiService.getTodos).toHaveBeenCalledWith({ status: 'inbox' })

      // Change filters
      rerender({ filters: { status: 'next' } })

      await waitFor(() => {
        expect(ApiService.getTodos).toHaveBeenCalledWith({ status: 'next' })
      })
    })
  })

  describe('CRUD Operations', () => {
    it('should create a new todo', async () => {
      const { ApiService } = await import('../../services/api.service')
      const newTodo = createMockTodo({ id: '4', title: 'New Todo' })
      
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.createTodo.mockResolvedValue(newTodo)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.createTodo({
          title: 'New Todo',
          description: 'Test description',
          status: 'inbox',
        })
      })

      expect(result.current.isCreating).toBe(true)

      await waitFor(() => {
        expect(result.current.isCreating).toBe(false)
      })

      expect(ApiService.createTodo).toHaveBeenCalledWith({
        title: 'New Todo',
        description: 'Test description',
        status: 'inbox',
      })
    })

    it('should update a todo', async () => {
      const { ApiService } = await import('../../services/api.service')
      const updatedTodo = { ...mockTodos[0], title: 'Updated Todo' }
      
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.updateTodo.mockResolvedValue(updatedTodo)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.updateTodo('1', { title: 'Updated Todo' })
      })

      expect(result.current.isUpdating).toBe(true)

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      expect(ApiService.updateTodo).toHaveBeenCalledWith('1', { title: 'Updated Todo' })
    })

    it('should delete a todo', async () => {
      const { ApiService } = await import('../../services/api.service')
      
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.deleteTodo.mockResolvedValue()

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.deleteTodo('1')
      })

      expect(result.current.isDeleting).toBe(true)

      await waitFor(() => {
        expect(result.current.isDeleting).toBe(false)
      })

      expect(ApiService.deleteTodo).toHaveBeenCalledWith('1')
    })

    it('should handle create todo errors', async () => {
      const { ApiService } = await import('../../services/api.service')
      const error = new Error('Failed to create todo')
      
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.createTodo.mockRejectedValue(error)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.createTodo({ title: 'New Todo', status: 'inbox' })
      })

      await waitFor(() => {
        expect(result.current.createError).toEqual(error)
      })

      expect(result.current.isCreating).toBe(false)
    })
  })

  describe('Optimistic Updates', () => {
    it('should apply optimistic updates for todo creation', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      
      // Slow API response
      ApiService.createTodo.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 500))
      )

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const initialTodosCount = result.current.todos.length

      act(() => {
        result.current.createTodo({
          title: 'Optimistic Todo',
          status: 'inbox',
        })
      })

      // Should immediately show the new todo optimistically
      expect(result.current.todos).toHaveLength(initialTodosCount + 1)
      expect(result.current.todos.find(t => t.title === 'Optimistic Todo')).toBeTruthy()
    })

    it('should revert optimistic updates on error', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.createTodo.mockRejectedValue(new Error('Create failed'))

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const initialTodosCount = result.current.todos.length

      act(() => {
        result.current.createTodo({
          title: 'Failed Todo',
          status: 'inbox',
        })
      })

      // Should show optimistically first
      expect(result.current.todos).toHaveLength(initialTodosCount + 1)

      await waitFor(() => {
        // Should revert after error
        expect(result.current.todos).toHaveLength(initialTodosCount)
      })

      expect(result.current.todos.find(t => t.title === 'Failed Todo')).toBeFalsy()
    })

    it('should apply optimistic updates for status changes', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.updateTodo.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 500))
      )

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.updateTodoStatus('1', 'completed')
      })

      // Should immediately update status optimistically
      const updatedTodo = result.current.todos.find(t => t.id === '1')
      expect(updatedTodo?.status).toBe('completed')
    })
  })

  describe('Real-time Updates', () => {
    it('should handle real-time todo updates', async () => {
      const { useWebSocket } = await import('../useWebSocket')
      const mockSubscribe = vi.fn()
      useWebSocket.mockReturnValue({
        connected: true,
        subscribe: mockSubscribe,
        unsubscribe: vi.fn(),
      })

      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      expect(mockSubscribe).toHaveBeenCalledWith('todos', expect.any(Function))
    })

    it('should update todos from WebSocket events', async () => {
      const { useWebSocket } = await import('../useWebSocket')
      let websocketCallback: Function

      const mockSubscribe = vi.fn((channel, callback) => {
        websocketCallback = callback
      })

      useWebSocket.mockReturnValue({
        connected: true,
        subscribe: mockSubscribe,
        unsubscribe: vi.fn(),
      })

      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const updatedTodo = { ...mockTodos[0], title: 'Updated via WebSocket' }

      act(() => {
        websocketCallback({
          type: 'todo_updated',
          data: updatedTodo,
        })
      })

      const todo = result.current.todos.find(t => t.id === '1')
      expect(todo?.title).toBe('Updated via WebSocket')
    })

    it('should handle new todos from WebSocket', async () => {
      const { useWebSocket } = await import('../useWebSocket')
      let websocketCallback: Function

      const mockSubscribe = vi.fn((channel, callback) => {
        websocketCallback = callback
      })

      useWebSocket.mockReturnValue({
        connected: true,
        subscribe: mockSubscribe,
        unsubscribe: vi.fn(),
      })

      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const newTodo = createMockTodo({ id: '4', title: 'New WebSocket Todo' })

      act(() => {
        websocketCallback({
          type: 'todo_created',
          data: newTodo,
        })
      })

      expect(result.current.todos).toHaveLength(4)
      expect(result.current.todos.find(t => t.id === '4')).toBeTruthy()
    })

    it('should handle deleted todos from WebSocket', async () => {
      const { useWebSocket } = await import('../useWebSocket')
      let websocketCallback: Function

      const mockSubscribe = vi.fn((channel, callback) => {
        websocketCallback = callback
      })

      useWebSocket.mockReturnValue({
        connected: true,
        subscribe: mockSubscribe,
        unsubscribe: vi.fn(),
      })

      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        websocketCallback({
          type: 'todo_deleted',
          data: { id: '1' },
        })
      })

      expect(result.current.todos).toHaveLength(2)
      expect(result.current.todos.find(t => t.id === '1')).toBeFalsy()
    })
  })

  describe('Subtask Operations', () => {
    it('should create subtasks', async () => {
      const { ApiService } = await import('../../services/api.service')
      const newSubtask = createMockSubtask({ id: '1', todoId: '1', title: 'New Subtask' })
      
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.createSubtask.mockResolvedValue(newSubtask)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.createSubtask('1', {
          title: 'New Subtask',
          completed: false,
        })
      })

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      expect(ApiService.createSubtask).toHaveBeenCalledWith('1', {
        title: 'New Subtask',
        completed: false,
      })
    })

    it('should update subtasks', async () => {
      const { ApiService } = await import('../../services/api.service')
      const todoWithSubtasks = createMockTodo({
        id: '1',
        subtasks: [createMockSubtask({ id: '1', title: 'Original' })],
      })
      
      ApiService.getTodos.mockResolvedValue([todoWithSubtasks])
      ApiService.updateSubtask.mockResolvedValue()

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.updateSubtask('1', '1', { title: 'Updated Subtask' })
      })

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      expect(ApiService.updateSubtask).toHaveBeenCalledWith('1', '1', {
        title: 'Updated Subtask',
      })
    })

    it('should delete subtasks', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.deleteSubtask.mockResolvedValue()

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.deleteSubtask('1', '1')
      })

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      expect(ApiService.deleteSubtask).toHaveBeenCalledWith('1', '1')
    })
  })

  describe('Bulk Operations', () => {
    it('should handle bulk status updates', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.updateTodo.mockResolvedValue()

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.bulkUpdateStatus(['1', '2'], 'completed')
      })

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      expect(ApiService.updateTodo).toHaveBeenCalledTimes(2)
      expect(ApiService.updateTodo).toHaveBeenCalledWith('1', { status: 'completed' })
      expect(ApiService.updateTodo).toHaveBeenCalledWith('2', { status: 'completed' })
    })

    it('should handle bulk deletions', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.deleteTodo.mockResolvedValue()

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.bulkDelete(['1', '2'])
      })

      await waitFor(() => {
        expect(result.current.isDeleting).toBe(false)
      })

      expect(ApiService.deleteTodo).toHaveBeenCalledTimes(2)
      expect(ApiService.deleteTodo).toHaveBeenCalledWith('1')
      expect(ApiService.deleteTodo).toHaveBeenCalledWith('2')
    })

    it('should handle partial bulk operation failures', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      
      // First call succeeds, second fails
      ApiService.updateTodo
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Update failed'))

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.bulkUpdateStatus(['1', '2'], 'completed')
      })

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      expect(result.current.bulkError).toBeTruthy()
      expect(result.current.bulkError?.message).toContain('1 of 2 operations failed')
    })
  })

  describe('Caching and Performance', () => {
    it('should cache todo data', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result, unmount, rerender } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(ApiService.getTodos).toHaveBeenCalledTimes(1)

      // Unmount and remount - should use cache
      unmount()
      rerender()

      // Should not refetch immediately due to caching
      expect(ApiService.getTodos).toHaveBeenCalledTimes(1)
    })

    it('should invalidate cache on mutations', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.createTodo.mockResolvedValue(createMockTodo({ id: '4' }))

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(ApiService.getTodos).toHaveBeenCalledTimes(1)

      act(() => {
        result.current.createTodo({ title: 'New Todo', status: 'inbox' })
      })

      await waitFor(() => {
        expect(result.current.isCreating).toBe(false)
      })

      // Should have refetched after mutation
      expect(ApiService.getTodos).toHaveBeenCalledTimes(2)
    })

    it('should debounce rapid updates', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)
      ApiService.updateTodo.mockResolvedValue()

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Make rapid updates
      act(() => {
        result.current.updateTodo('1', { title: 'Update 1' })
        result.current.updateTodo('1', { title: 'Update 2' })
        result.current.updateTodo('1', { title: 'Update 3' })
      })

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      // Should have debounced to only the latest update
      expect(ApiService.updateTodo).toHaveBeenCalledTimes(1)
      expect(ApiService.updateTodo).toHaveBeenCalledWith('1', { title: 'Update 3' })
    })
  })

  describe('Sorting and Filtering', () => {
    it('should provide sorted todos', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos({
        sortBy: 'title',
        sortOrder: 'asc',
      }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const titles = result.current.todos.map(t => t.title)
      expect(titles).toEqual(['Todo 1', 'Todo 2', 'Todo 3'])
    })

    it('should provide filtered todos', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos({
        status: 'inbox',
      }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.todos).toHaveLength(1)
      expect(result.current.todos[0].status).toBe('inbox')
    })

    it('should provide grouped todos', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos({
        groupBy: 'status',
      }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.groupedTodos).toBeDefined()
      expect(result.current.groupedTodos?.inbox).toHaveLength(1)
      expect(result.current.groupedTodos?.next).toHaveLength(1)
      expect(result.current.groupedTodos?.completed).toHaveLength(1)
    })
  })

  describe('Statistics', () => {
    it('should provide todo statistics', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(mockTodos)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.stats).toEqual({
        total: 3,
        inbox: 1,
        next: 1,
        waiting: 0,
        someday: 0,
        completed: 1,
        completionRate: 1 / 3,
      })
    })

    it('should calculate completion trends', async () => {
      const todosWithCompletionDates = mockTodos.map((todo, index) => ({
        ...todo,
        completedAt: index === 2 ? '2024-01-01T12:00:00Z' : null,
      }))

      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockResolvedValue(todosWithCompletionDates)

      const { result } = renderHook(() => useTodos({
        includeStats: true,
      }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.trends).toBeDefined()
      expect(result.current.trends?.completedToday).toBe(1)
    })
  })

  describe('Error Recovery', () => {
    it('should retry failed requests', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockTodos)

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })

      act(() => {
        result.current.retry()
      })

      await waitFor(() => {
        expect(result.current.error).toBeNull()
        expect(result.current.todos).toEqual(mockTodos)
      })

      expect(ApiService.getTodos).toHaveBeenCalledTimes(2)
    })

    it('should handle offline scenarios', async () => {
      const { ApiService } = await import('../../services/api.service')
      ApiService.getTodos.mockRejectedValue(new Error('Network unavailable'))

      const { result } = renderHook(() => useTodos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
        expect(result.current.isOffline).toBe(true)
      })
    })
  })
})