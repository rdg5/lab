import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiService, TodoFilters, CreateTodoData, UpdateTodoData, CreateSubtaskData, UpdateSubtaskData } from '../services/api.service'
import { GTDTodo, GTDSubtask } from '../test/utils/test-utils'
import { useWebSocket } from './useWebSocket'

export interface UseTodosOptions extends TodoFilters {
  enabled?: boolean
}

export interface TodoStats {
  total: number
  inbox: number
  next: number
  waiting: number
  someday: number
  completed: number
  completionRate: number
}

export interface TodoTrends {
  completedToday: number
  completedThisWeek: number
  completedThisMonth: number
}

export interface GroupedTodos {
  [key: string]: GTDTodo[]
}

export interface BulkError {
  message: string
  failed: string[]
  succeeded: string[]
}

export interface UseTodosReturn {
  // Data
  todos: GTDTodo[]
  groupedTodos?: GroupedTodos
  stats: TodoStats
  trends?: TodoTrends
  
  // Loading states
  isLoading: boolean
  isCreating: boolean
  isUpdating: boolean
  isDeleting: boolean
  
  // Error states
  error: Error | null
  createError: Error | null
  updateError: Error | null
  deleteError: Error | null
  bulkError: BulkError | null
  isOffline: boolean
  
  // Actions
  createTodo: (data: CreateTodoData) => Promise<void>
  updateTodo: (id: string, data: UpdateTodoData) => Promise<void>
  updateTodoStatus: (id: string, status: GTDTodo['status']) => Promise<void>
  deleteTodo: (id: string) => Promise<void>
  
  // Subtask actions
  createSubtask: (todoId: string, data: CreateSubtaskData) => Promise<void>
  updateSubtask: (todoId: string, subtaskId: string, data: UpdateSubtaskData) => Promise<void>
  deleteSubtask: (todoId: string, subtaskId: string) => Promise<void>
  
  // Bulk actions
  bulkUpdateStatus: (ids: string[], status: GTDTodo['status']) => Promise<void>
  bulkDelete: (ids: string[]) => Promise<void>
  
  // Utility actions
  retry: () => void
  refresh: () => void
}

const TODOS_QUERY_KEY = 'todos'

export function useTodos(options: UseTodosOptions = {}): UseTodosReturn {
  const { enabled = true, ...filters } = options
  const queryClient = useQueryClient()
  const { subscribe, unsubscribe, connected } = useWebSocket()
  const debounceTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Query for fetching todos
  const {
    data: todos = [],
    isLoading,
    error,
    refetch: retry,
  } = useQuery({
    queryKey: [TODOS_QUERY_KEY, filters],
    queryFn: () => ApiService.getTodos(filters),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  })

  // Generate optimistic ID
  const generateOptimisticId = useCallback(() => {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateTodoData) => ApiService.createTodo(data),
    onMutate: async (newTodoData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [TODOS_QUERY_KEY] })

      // Snapshot previous value
      const previousTodos = queryClient.getQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters])

      // Optimistic update
      const optimisticTodo: GTDTodo = {
        id: generateOptimisticId(),
        ...newTodoData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
        subtasks: [],
        tags: newTodoData.tags || [],
        priority: newTodoData.priority || 'medium',
        energy: newTodoData.energy || 'medium',
      }

      queryClient.setQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters], (old = []) => [
        ...old,
        optimisticTodo,
      ])

      return { previousTodos }
    },
    onError: (err, newTodo, context) => {
      // Revert optimistic update
      if (context?.previousTodos) {
        queryClient.setQueryData([TODOS_QUERY_KEY, filters], context.previousTodos)
      }
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY] })
    },
  })

  // Update mutation with debouncing
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTodoData }) => 
      ApiService.updateTodo(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [TODOS_QUERY_KEY] })

      // Snapshot previous value
      const previousTodos = queryClient.getQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters])

      // Optimistic update
      queryClient.setQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters], (old = []) =>
        old.map(todo =>
          todo.id === id
            ? { 
                ...todo, 
                ...data, 
                updatedAt: new Date().toISOString(),
                syncStatus: 'pending' as const,
              }
            : todo
        )
      )

      return { previousTodos }
    },
    onError: (err, { id }, context) => {
      // Revert optimistic update
      if (context?.previousTodos) {
        queryClient.setQueryData([TODOS_QUERY_KEY, filters], context.previousTodos)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY] })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => ApiService.deleteTodo(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [TODOS_QUERY_KEY] })
      const previousTodos = queryClient.getQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters])

      queryClient.setQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters], (old = []) =>
        old.filter(todo => todo.id !== id)
      )

      return { previousTodos }
    },
    onError: (err, id, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData([TODOS_QUERY_KEY, filters], context.previousTodos)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY] })
    },
  })

  // Subtask mutations
  const createSubtaskMutation = useMutation({
    mutationFn: ({ todoId, data }: { todoId: string; data: CreateSubtaskData }) =>
      ApiService.createSubtask(todoId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY] })
    },
  })

  const updateSubtaskMutation = useMutation({
    mutationFn: ({ todoId, subtaskId, data }: { 
      todoId: string; 
      subtaskId: string; 
      data: UpdateSubtaskData 
    }) => ApiService.updateSubtask(todoId, subtaskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY] })
    },
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: ({ todoId, subtaskId }: { todoId: string; subtaskId: string }) =>
      ApiService.deleteSubtask(todoId, subtaskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY] })
    },
  })

  // Bulk operations state
  const [bulkError, setBulkError] = useState<BulkError | null>(null)

  // Debounced update function
  const debouncedUpdate = useCallback((id: string, data: UpdateTodoData, delay = 500) => {
    // Clear existing timeout for this todo
    const existingTimeout = debounceTimeoutsRef.current.get(id)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      updateMutation.mutate({ id, data })
      debounceTimeoutsRef.current.delete(id)
    }, delay)

    debounceTimeoutsRef.current.set(id, timeout)
  }, [updateMutation])

  // WebSocket event handler
  const handleWebSocketMessage = useCallback((event: { type: string; data: any }) => {
    const currentTodos = queryClient.getQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters]) || []

    switch (event.type) {
      case 'todo_created':
        queryClient.setQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters], [
          ...currentTodos,
          event.data,
        ])
        break
      
      case 'todo_updated':
        queryClient.setQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters], 
          currentTodos.map(todo =>
            todo.id === event.data.id ? event.data : todo
          )
        )
        break
      
      case 'todo_deleted':
        queryClient.setQueryData<GTDTodo[]>([TODOS_QUERY_KEY, filters],
          currentTodos.filter(todo => todo.id !== event.data.id)
        )
        break
    }
  }, [queryClient, filters])

  // Subscribe to WebSocket updates
  useEffect(() => {
    if (connected) {
      subscribe('todos', handleWebSocketMessage)
      
      return () => {
        unsubscribe('todos')
      }
    }
  }, [connected, subscribe, unsubscribe, handleWebSocketMessage])

  // Computed values
  const stats: TodoStats = useMemo(() => {
    const total = todos.length
    const inbox = todos.filter(t => t.status === 'inbox').length
    const next = todos.filter(t => t.status === 'next').length
    const waiting = todos.filter(t => t.status === 'waiting').length
    const someday = todos.filter(t => t.status === 'someday').length
    const completed = todos.filter(t => t.status === 'completed').length
    const completionRate = total > 0 ? completed / total : 0

    return { total, inbox, next, waiting, someday, completed, completionRate }
  }, [todos])

  const groupedTodos: GroupedTodos | undefined = useMemo(() => {
    if (!filters.groupBy) return undefined

    return todos.reduce((acc, todo) => {
      const groupKey = filters.groupBy === 'status' ? todo.status :
                      filters.groupBy === 'project' ? (todo.project || 'No Project') :
                      filters.groupBy === 'context' ? (todo.context?.[0] || 'No Context') :
                      filters.groupBy === 'priority' ? todo.priority : 'Other'
      
      if (!acc[groupKey]) {
        acc[groupKey] = []
      }
      acc[groupKey].push(todo)
      return acc
    }, {} as GroupedTodos)
  }, [todos, filters.groupBy])

  const trends: TodoTrends | undefined = useMemo(() => {
    if (!filters.includeStats) return undefined

    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const completedToday = todos.filter(todo => {
      if (!todo.completedAt) return false
      const completedDate = new Date(todo.completedAt)
      return completedDate >= startOfToday
    }).length

    const completedThisWeek = todos.filter(todo => {
      if (!todo.completedAt) return false
      const completedDate = new Date(todo.completedAt)
      return completedDate >= startOfWeek
    }).length

    const completedThisMonth = todos.filter(todo => {
      if (!todo.completedAt) return false
      const completedDate = new Date(todo.completedAt)
      return completedDate >= startOfMonth
    }).length

    return { completedToday, completedThisWeek, completedThisMonth }
  }, [todos, filters.includeStats])

  // Action functions
  const createTodo = useCallback(async (data: CreateTodoData) => {
    await createMutation.mutateAsync(data)
  }, [createMutation])

  const updateTodo = useCallback(async (id: string, data: UpdateTodoData) => {
    // For rapid updates, use debouncing
    if (Object.keys(data).length === 1 && (data.title || data.description)) {
      debouncedUpdate(id, data)
      return
    }
    
    await updateMutation.mutateAsync({ id, data })
  }, [updateMutation, debouncedUpdate])

  const updateTodoStatus = useCallback(async (id: string, status: GTDTodo['status']) => {
    const updateData: UpdateTodoData = { status }
    if (status === 'completed') {
      updateData.completedAt = new Date().toISOString()
    }
    await updateMutation.mutateAsync({ id, data: updateData })
  }, [updateMutation])

  const deleteTodo = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id)
  }, [deleteMutation])

  const createSubtask = useCallback(async (todoId: string, data: CreateSubtaskData) => {
    await createSubtaskMutation.mutateAsync({ todoId, data })
  }, [createSubtaskMutation])

  const updateSubtask = useCallback(async (todoId: string, subtaskId: string, data: UpdateSubtaskData) => {
    await updateSubtaskMutation.mutateAsync({ todoId, subtaskId, data })
  }, [updateSubtaskMutation])

  const deleteSubtask = useCallback(async (todoId: string, subtaskId: string) => {
    await deleteSubtaskMutation.mutateAsync({ todoId, subtaskId })
  }, [deleteSubtaskMutation])

  const bulkUpdateStatus = useCallback(async (ids: string[], status: GTDTodo['status']) => {
    setBulkError(null)
    const results = await Promise.allSettled(
      ids.map(id => updateTodoStatus(id, status))
    )
    
    const failed = results
      .map((result, index) => ({ result, id: ids[index] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ id }) => id)

    if (failed.length > 0) {
      setBulkError({
        message: `${failed.length} of ${ids.length} operations failed`,
        failed,
        succeeded: ids.filter(id => !failed.includes(id)),
      })
    }
  }, [updateTodoStatus])

  const bulkDelete = useCallback(async (ids: string[]) => {
    setBulkError(null)
    const results = await Promise.allSettled(
      ids.map(id => deleteTodo(id))
    )
    
    const failed = results
      .map((result, index) => ({ result, id: ids[index] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ id }) => id)

    if (failed.length > 0) {
      setBulkError({
        message: `${failed.length} of ${ids.length} operations failed`,
        failed,
        succeeded: ids.filter(id => !failed.includes(id)),
      })
    }
  }, [deleteTodo])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY] })
  }, [queryClient])

  // Check if offline
  const isOffline = useMemo(() => {
    return error?.message?.includes('Network') || error?.message?.includes('fetch')
  }, [error])

  return {
    // Data
    todos,
    groupedTodos,
    stats,
    trends,
    
    // Loading states
    isLoading,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending || createSubtaskMutation.isPending || 
                updateSubtaskMutation.isPending,
    isDeleting: deleteMutation.isPending || deleteSubtaskMutation.isPending,
    
    // Error states
    error,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
    bulkError,
    isOffline,
    
    // Actions
    createTodo,
    updateTodo,
    updateTodoStatus,
    deleteTodo,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    bulkUpdateStatus,
    bulkDelete,
    retry,
    refresh,
  }
}