import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useOfflineQueue } from '../useOfflineQueue'
import { mockLocalStorage } from '../../test/utils/test-utils'

// Mock services
vi.mock('../../services/offline.service', () => ({
  OfflineService: {
    getQueue: vi.fn(),
    addToQueue: vi.fn(),
    removeFromQueue: vi.fn(),
    updateQueueItem: vi.fn(),
    clearQueue: vi.fn(),
    processQueue: vi.fn(),
    getQueueStats: vi.fn(),
    exportQueue: vi.fn(),
    importQueue: vi.fn(),
    compressQueue: vi.fn(),
  },
}))

vi.mock('../../services/api.service', () => ({
  ApiService: {
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    createSubtask: vi.fn(),
    updateSubtask: vi.fn(),
    deleteSubtask: vi.fn(),
  },
}))

// Mock IndexedDB
const mockIDB = {
  open: vi.fn(),
  transaction: vi.fn(),
  objectStore: vi.fn(),
  add: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
}

global.indexedDB = mockIDB as any

describe('useOfflineQueue Hook', () => {
  const mockQueueItems = [
    {
      id: '1',
      type: 'todo',
      action: 'create',
      data: { title: 'Offline Todo 1', status: 'inbox' },
      timestamp: '2024-01-01T12:00:00Z',
      retryCount: 0,
      priority: 1,
      status: 'pending',
    },
    {
      id: '2',
      type: 'todo',
      action: 'update',
      data: { id: '123', title: 'Updated Todo' },
      timestamp: '2024-01-01T12:01:00Z',
      retryCount: 1,
      priority: 2,
      status: 'retrying',
    },
    {
      id: '3',
      type: 'subtask',
      action: 'delete',
      data: { todoId: '123', subtaskId: '456' },
      timestamp: '2024-01-01T12:02:00Z',
      retryCount: 3,
      priority: 3,
      status: 'failed',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage()
    
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
    })
  })

  describe('Queue Initialization', () => {
    it('should initialize with existing queue items', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)

      const { result } = renderHook(() => useOfflineQueue())

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(OfflineService.getQueue).toHaveBeenCalled()
      expect(result.current.queue).toEqual(mockQueueItems)
      expect(result.current.pendingCount).toBe(1)
      expect(result.current.failedCount).toBe(1)
    })

    it('should handle queue initialization errors', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const error = new Error('Failed to load queue')
      OfflineService.getQueue.mockRejectedValue(error)

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.error).toEqual(error)
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.queue).toEqual([])
    })

    it('should initialize with empty queue when none exists', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.queue).toEqual([])
      expect(result.current.isEmpty).toBe(true)
    })
  })

  describe('Adding Items to Queue', () => {
    it('should add todo creation to queue', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.addToQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const todoData = {
        title: 'New Offline Todo',
        description: 'Created while offline',
        status: 'inbox',
      }

      act(() => {
        result.current.addTodo(todoData)
      })

      await waitFor(() => {
        expect(OfflineService.addToQueue).toHaveBeenCalledWith({
          type: 'todo',
          action: 'create',
          data: todoData,
          priority: expect.any(Number),
        })
      })
    })

    it('should add todo update to queue', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.addToQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.updateTodo('123', { title: 'Updated Title' })
      })

      await waitFor(() => {
        expect(OfflineService.addToQueue).toHaveBeenCalledWith({
          type: 'todo',
          action: 'update',
          data: { id: '123', title: 'Updated Title' },
          priority: expect.any(Number),
        })
      })
    })

    it('should add todo deletion to queue', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.addToQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.deleteTodo('123')
      })

      await waitFor(() => {
        expect(OfflineService.addToQueue).toHaveBeenCalledWith({
          type: 'todo',
          action: 'delete',
          data: { id: '123' },
          priority: expect.any(Number),
        })
      })
    })

    it('should add subtask operations to queue', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.addToQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Add subtask
      act(() => {
        result.current.addSubtask('123', { title: 'New Subtask', completed: false })
      })

      await waitFor(() => {
        expect(OfflineService.addToQueue).toHaveBeenCalledWith({
          type: 'subtask',
          action: 'create',
          data: { todoId: '123', title: 'New Subtask', completed: false },
          priority: expect.any(Number),
        })
      })

      // Update subtask
      act(() => {
        result.current.updateSubtask('123', '456', { completed: true })
      })

      await waitFor(() => {
        expect(OfflineService.addToQueue).toHaveBeenCalledWith({
          type: 'subtask',
          action: 'update',
          data: { todoId: '123', subtaskId: '456', completed: true },
          priority: expect.any(Number),
        })
      })

      // Delete subtask
      act(() => {
        result.current.deleteSubtask('123', '456')
      })

      await waitFor(() => {
        expect(OfflineService.addToQueue).toHaveBeenCalledWith({
          type: 'subtask',
          action: 'delete',
          data: { todoId: '123', subtaskId: '456' },
          priority: expect.any(Number),
        })
      })
    })

    it('should handle add operation errors', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.addToQueue.mockRejectedValue(new Error('Add failed'))

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.addTodo({ title: 'Test', status: 'inbox' })
      })

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })
    })
  })

  describe('Queue Processing', () => {
    it('should process queue when online', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { ApiService } = await import('../../services/api.service')
      
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.processQueue.mockResolvedValue()
      
      // Mock successful API calls
      ApiService.createTodo.mockResolvedValue({ id: '123' })
      ApiService.updateTodo.mockResolvedValue()
      ApiService.deleteSubtask.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.processQueue()
      })

      expect(result.current.isProcessing).toBe(true)

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false)
      })

      expect(OfflineService.processQueue).toHaveBeenCalled()
    })

    it('should automatically process queue when coming online', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.processQueue.mockResolvedValue()

      // Start offline
      Object.defineProperty(navigator, 'onLine', { value: false })

      const { result } = renderHook(() => useOfflineQueue({
        autoProcess: true,
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isProcessing).toBe(false)

      // Come online
      Object.defineProperty(navigator, 'onLine', { value: true })
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(true)
      })

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false)
      })

      expect(OfflineService.processQueue).toHaveBeenCalled()
    })

    it('should process items in priority order', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { ApiService } = await import('../../services/api.service')
      
      const prioritizedItems = [
        { ...mockQueueItems[0], priority: 3 }, // Low priority
        { ...mockQueueItems[1], priority: 1 }, // High priority
        { ...mockQueueItems[2], priority: 2 }, // Medium priority
      ]

      OfflineService.getQueue.mockResolvedValue(prioritizedItems)
      ApiService.createTodo.mockResolvedValue({ id: '123' })
      ApiService.updateTodo.mockResolvedValue()
      ApiService.deleteSubtask.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.processQueue()
      })

      // Should process high priority first
      expect(result.current.currentProcessingItem?.priority).toBe(1)
    })

    it('should handle partial queue processing failures', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { ApiService } = await import('../../services/api.service')
      
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      
      // First item succeeds, second fails
      ApiService.createTodo.mockResolvedValue({ id: '123' })
      ApiService.updateTodo.mockRejectedValue(new Error('Update failed'))

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.processQueue()
      })

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false)
      })

      expect(result.current.processResults).toEqual({
        processed: 1,
        succeeded: 1,
        failed: 1,
        errors: [expect.any(Error)],
      })
    })

    it('should retry failed items with exponential backoff', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { ApiService } = await import('../../services/api.service')
      
      const failedItem = { ...mockQueueItems[1], retryCount: 2 }
      OfflineService.getQueue.mockResolvedValue([failedItem])
      
      // Fail first two attempts, succeed on third
      ApiService.updateTodo
        .mockRejectedValueOnce(new Error('Retry 1'))
        .mockRejectedValueOnce(new Error('Retry 2'))
        .mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue({
        maxRetries: 3,
        exponentialBackoff: true,
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.retryItem(failedItem.id)
      })

      await waitFor(() => {
        expect(result.current.retryInProgress).toBe(false)
      }, { timeout: 10000 })

      expect(ApiService.updateTodo).toHaveBeenCalledTimes(1)
    })

    it('should respect rate limiting', async () => {
      const { result } = renderHook(() => useOfflineQueue({
        rateLimitDelay: 100, // 100ms between requests
      }))

      const startTime = Date.now()

      act(() => {
        result.current.addTodo({ title: 'Todo 1', status: 'inbox' })
        result.current.addTodo({ title: 'Todo 2', status: 'inbox' })
        result.current.addTodo({ title: 'Todo 3', status: 'inbox' })
      })

      act(() => {
        result.current.processQueue()
      })

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false)
      })

      const duration = Date.now() - startTime
      expect(duration).toBeGreaterThan(200) // At least 2 * 100ms delay
    })
  })

  describe('Queue Management', () => {
    it('should remove item from queue', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.removeFromQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.removeItem('1')
      })

      await waitFor(() => {
        expect(OfflineService.removeFromQueue).toHaveBeenCalledWith('1')
      })
    })

    it('should update queue item', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.updateQueueItem.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.updateItem('1', { priority: 5 })
      })

      await waitFor(() => {
        expect(OfflineService.updateQueueItem).toHaveBeenCalledWith('1', { priority: 5 })
      })
    })

    it('should clear entire queue', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.clearQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.clearQueue()
      })

      await waitFor(() => {
        expect(OfflineService.clearQueue).toHaveBeenCalled()
      })

      expect(result.current.queue).toEqual([])
      expect(result.current.isEmpty).toBe(true)
    })

    it('should clear only failed items', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.removeFromQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.clearFailedItems()
      })

      await waitFor(() => {
        // Should remove only the failed item (id: '3')
        expect(OfflineService.removeFromQueue).toHaveBeenCalledWith('3')
      })
    })

    it('should reorder queue items by priority', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.reorderQueue('priority')
      })

      const reorderedQueue = result.current.queue
      expect(reorderedQueue[0].priority).toBeLessThanOrEqual(reorderedQueue[1].priority)
    })
  })

  describe('Queue Statistics and Monitoring', () => {
    it('should provide queue statistics', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const mockStats = {
        total: 10,
        pending: 5,
        processing: 1,
        completed: 3,
        failed: 1,
        avgProcessingTime: 1500,
        successRate: 0.85,
      }

      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.getQueueStats.mockResolvedValue(mockStats)

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.getStats()
      })

      await waitFor(() => {
        expect(result.current.stats).toEqual(mockStats)
      })
    })

    it('should track processing time for each item', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { ApiService } = await import('../../services/api.service')
      
      OfflineService.getQueue.mockResolvedValue([mockQueueItems[0]])
      ApiService.createTodo.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ id: '123' }), 100))
      )

      const { result } = renderHook(() => useOfflineQueue({
        trackProcessingTime: true,
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const startTime = Date.now()

      act(() => {
        result.current.processQueue()
      })

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false)
      })

      const processingTime = Date.now() - startTime
      expect(result.current.lastProcessingTime).toBeGreaterThan(90)
      expect(result.current.lastProcessingTime).toBeLessThan(200)
    })

    it('should monitor queue size and warn when approaching limits', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const largeQueue = Array.from({ length: 95 }, (_, i) => ({
        ...mockQueueItems[0],
        id: `${i}`,
      }))

      OfflineService.getQueue.mockResolvedValue(largeQueue)

      const { result } = renderHook(() => useOfflineQueue({
        maxQueueSize: 100,
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isNearCapacity).toBe(true)
      expect(result.current.capacityWarning).toBe('Queue is 95% full')
    })

    it('should estimate processing time for remaining items', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)

      const { result } = renderHook(() => useOfflineQueue({
        estimateProcessingTime: true,
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.estimatedProcessingTime).toBeGreaterThan(0)
    })
  })

  describe('Data Persistence and Storage', () => {
    it('should persist queue to IndexedDB', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.addToQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue({
        persistenceType: 'indexeddb',
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.addTodo({ title: 'Persistent Todo', status: 'inbox' })
      })

      await waitFor(() => {
        expect(mockIDB.add).toHaveBeenCalled()
      })
    })

    it('should compress queue data for storage', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.compressQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue({
        compression: true,
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.compressQueue()
      })

      await waitFor(() => {
        expect(OfflineService.compressQueue).toHaveBeenCalled()
      })
    })

    it('should handle storage quota exceeded', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const quotaError = new Error('Storage quota exceeded')
      quotaError.name = 'QuotaExceededError'
      
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.addToQueue.mockRejectedValue(quotaError)

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.addTodo({ title: 'Test', status: 'inbox' })
      })

      await waitFor(() => {
        expect(result.current.storageError).toEqual(quotaError)
      })

      expect(result.current.isStorageFull).toBe(true)
    })

    it('should cleanup old completed items', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const oldItems = mockQueueItems.map(item => ({
        ...item,
        status: 'completed',
        completedAt: '2024-01-01T00:00:00Z', // Very old
      }))

      OfflineService.getQueue.mockResolvedValue(oldItems)
      OfflineService.removeFromQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue({
        autoCleanup: true,
        cleanupAge: 24 * 60 * 60 * 1000, // 24 hours
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.cleanupOldItems()
      })

      await waitFor(() => {
        expect(OfflineService.removeFromQueue).toHaveBeenCalledTimes(3)
      })
    })
  })

  describe('Import/Export', () => {
    it('should export queue data', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const exportData = {
        version: '1.0',
        timestamp: '2024-01-01T12:00:00Z',
        items: mockQueueItems,
      }

      OfflineService.getQueue.mockResolvedValue(mockQueueItems)
      OfflineService.exportQueue.mockResolvedValue(exportData)

      const mockWriteText = vi.fn()
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
      })

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.exportQueue()
      })

      await waitFor(() => {
        expect(OfflineService.exportQueue).toHaveBeenCalled()
        expect(mockWriteText).toHaveBeenCalledWith(JSON.stringify(exportData, null, 2))
      })
    })

    it('should import queue data', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const importData = {
        version: '1.0',
        items: mockQueueItems,
      }

      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.importQueue.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.importQueue(JSON.stringify(importData))
      })

      await waitFor(() => {
        expect(OfflineService.importQueue).toHaveBeenCalledWith(importData.items)
      })
    })

    it('should validate imported queue data', async () => {
      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const invalidData = '{"invalid": "format"}'

      act(() => {
        result.current.importQueue(invalidData)
      })

      await waitFor(() => {
        expect(result.current.importError).toBeTruthy()
        expect(result.current.importError?.message).toContain('Invalid queue format')
      })
    })
  })

  describe('Conflict Resolution', () => {
    it('should detect and resolve conflicts', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { ApiService } = await import('../../services/api.service')
      
      const conflictError = new Error('Conflict detected')
      conflictError.name = 'ConflictError'
      conflictError.details = {
        local: { title: 'Local version' },
        remote: { title: 'Remote version' },
      }

      OfflineService.getQueue.mockResolvedValue([mockQueueItems[1]])
      ApiService.updateTodo.mockRejectedValue(conflictError)

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.processQueue()
      })

      await waitFor(() => {
        expect(result.current.conflicts).toHaveLength(1)
      })

      expect(result.current.conflicts[0]).toEqual({
        queueItemId: mockQueueItems[1].id,
        local: { title: 'Local version' },
        remote: { title: 'Remote version' },
        type: 'todo_update',
      })
    })

    it('should resolve conflicts with user choice', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.getQueue.mockResolvedValue([])
      OfflineService.updateQueueItem.mockResolvedValue()

      const { result } = renderHook(() => useOfflineQueue())

      // Simulate existing conflict
      act(() => {
        result.current.addConflict({
          queueItemId: '1',
          local: { title: 'Local version' },
          remote: { title: 'Remote version' },
          type: 'todo_update',
        })
      })

      expect(result.current.conflicts).toHaveLength(1)

      act(() => {
        result.current.resolveConflict('1', 'local')
      })

      await waitFor(() => {
        expect(result.current.conflicts).toHaveLength(0)
      })

      expect(OfflineService.updateQueueItem).toHaveBeenCalledWith('1', {
        data: { title: 'Local version' },
      })
    })

    it('should auto-resolve simple conflicts', async () => {
      const { result } = renderHook(() => useOfflineQueue({
        autoResolveConflicts: true,
      }))

      const simpleConflict = {
        queueItemId: '1',
        local: { lastModified: '2024-01-01T13:00:00Z' },
        remote: { lastModified: '2024-01-01T12:00:00Z' },
        type: 'todo_update',
      }

      act(() => {
        result.current.addConflict(simpleConflict)
      })

      await waitFor(() => {
        // Should auto-resolve to newer version (local)
        expect(result.current.conflicts).toHaveLength(0)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors during processing', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { ApiService } = await import('../../services/api.service')
      
      OfflineService.getQueue.mockResolvedValue([mockQueueItems[0]])
      ApiService.createTodo.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.processQueue()
      })

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false)
      })

      expect(result.current.networkError).toBeTruthy()
    })

    it('should handle authentication errors', async () => {
      const { ApiService } = await import('../../services/api.service')
      const authError = new Error('Authentication failed')
      authError.name = 'AuthenticationError'
      
      ApiService.createTodo.mockRejectedValue(authError)

      const { result } = renderHook(() => useOfflineQueue())

      act(() => {
        result.current.addTodo({ title: 'Test', status: 'inbox' })
      })

      act(() => {
        result.current.processQueue()
      })

      await waitFor(() => {
        expect(result.current.authError).toBeTruthy()
      })

      expect(result.current.isPaused).toBe(true) // Should pause processing
    })

    it('should handle corruption in queue data', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const corruptedItem = { ...mockQueueItems[0] }
      delete corruptedItem.type // Missing required field
      
      OfflineService.getQueue.mockResolvedValue([corruptedItem])

      const { result } = renderHook(() => useOfflineQueue())

      await waitFor(() => {
        expect(result.current.corruptedItems).toHaveLength(1)
      })

      expect(result.current.corruptedItems[0]).toEqual(corruptedItem)
    })
  })

  describe('Memory Management', () => {
    it('should cleanup event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderHook(() => useOfflineQueue())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    })

    it('should cancel processing on unmount', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      let processPromise: Promise<void>
      
      OfflineService.processQueue.mockImplementation(() => {
        processPromise = new Promise(() => {}) // Never resolving
        return processPromise
      })

      const { result, unmount } = renderHook(() => useOfflineQueue())

      act(() => {
        result.current.processQueue()
      })

      expect(result.current.isProcessing).toBe(true)

      unmount()

      expect(result.current.isProcessing).toBe(false)
    })

    it('should clear timers on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      const { unmount } = renderHook(() => useOfflineQueue({
        autoProcess: true,
        processInterval: 5000,
      }))

      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })
})