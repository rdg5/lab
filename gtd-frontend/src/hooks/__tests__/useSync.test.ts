import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSync } from '../useSync'
import { createMockSyncStatus, MockWebSocket, MockEventSource } from '../../test/utils/test-utils'

// Mock services
vi.mock('../../services/sync.service', () => ({
  SyncService: {
    getStatus: vi.fn(),
    startSync: vi.fn(),
    pauseSync: vi.fn(),
    resumeSync: vi.fn(),
    forceSync: vi.fn(),
    retrySync: vi.fn(),
    clearQueue: vi.fn(),
    getSyncQueue: vi.fn(),
    addToQueue: vi.fn(),
    removeFromQueue: vi.fn(),
    getSyncHistory: vi.fn(),
  },
}))

vi.mock('../../services/offline.service', () => ({
  OfflineService: {
    isOnline: vi.fn(),
    getPendingChanges: vi.fn(),
    savePendingChange: vi.fn(),
    clearPendingChanges: vi.fn(),
    getStorageUsage: vi.fn(),
    cleanupStorage: vi.fn(),
  },
}))

// Mock WebSocket and EventSource
global.WebSocket = MockWebSocket as any
global.EventSource = MockEventSource as any

describe('useSync Hook', () => {
  const mockSyncStatus = createMockSyncStatus({
    isOnline: true,
    syncInProgress: false,
    pendingChanges: 0,
    lastSync: '2024-01-01T12:00:00Z',
    error: null,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
    })
    
    // Mock network information
    Object.defineProperty(navigator, 'connection', {
      value: {
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
      },
      writable: true,
    })
  })

  describe('Sync Status', () => {
    it('should initialize with current sync status', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)

      const { result } = renderHook(() => useSync())

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(SyncService.getStatus).toHaveBeenCalled()
      expect(result.current.status).toEqual(mockSyncStatus)
      expect(result.current.isOnline).toBe(true)
      expect(result.current.isSyncing).toBe(false)
    })

    it('should handle sync status loading errors', async () => {
      const { SyncService } = await import('../../services/sync.service')
      const error = new Error('Failed to get sync status')
      SyncService.getStatus.mockRejectedValue(error)

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.error).toEqual(error)
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('should update status when sync state changes', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const updatedStatus = createMockSyncStatus({
        ...mockSyncStatus,
        syncInProgress: true,
      })

      act(() => {
        // Simulate sync status update
        result.current.updateStatus(updatedStatus)
      })

      expect(result.current.isSyncing).toBe(true)
      expect(result.current.status.syncInProgress).toBe(true)
    })
  })

  describe('Network Status Monitoring', () => {
    it('should detect online/offline changes', async () => {
      const { result } = renderHook(() => useSync())

      expect(result.current.isOnline).toBe(true)

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', { value: false })
      window.dispatchEvent(new Event('offline'))

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false)
      })

      // Simulate coming back online
      Object.defineProperty(navigator, 'onLine', { value: true })
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true)
      })
    })

    it('should monitor connection quality', async () => {
      const { result } = renderHook(() => useSync())

      expect(result.current.connectionQuality).toBe('good')

      // Simulate slow connection
      Object.defineProperty(navigator, 'connection', {
        value: {
          effectiveType: '2g',
          downlink: 0.5,
          rtt: 2000,
        },
      })

      window.dispatchEvent(new Event('change'))

      await waitFor(() => {
        expect(result.current.connectionQuality).toBe('slow')
      })
    })

    it('should pause sync on slow connections in battery save mode', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.pauseSync.mockResolvedValue()

      // Mock battery API
      Object.defineProperty(navigator, 'getBattery', {
        value: () => Promise.resolve({
          level: 0.2, // 20% battery
          charging: false,
        }),
      })

      const { result } = renderHook(() => useSync({
        batterySaveMode: true,
      }))

      // Simulate slow connection
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '2g', downlink: 0.3 },
      })

      act(() => {
        window.dispatchEvent(new Event('change'))
      })

      await waitFor(() => {
        expect(SyncService.pauseSync).toHaveBeenCalled()
      })

      expect(result.current.isPaused).toBe(true)
    })
  })

  describe('Sync Operations', () => {
    it('should start sync', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.startSync.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.startSync()
      })

      expect(result.current.isSyncing).toBe(true)

      await waitFor(() => {
        expect(SyncService.startSync).toHaveBeenCalled()
      })
    })

    it('should pause sync', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue({
        ...mockSyncStatus,
        syncInProgress: true,
      })
      SyncService.pauseSync.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isSyncing).toBe(true)
      })

      act(() => {
        result.current.pauseSync()
      })

      await waitFor(() => {
        expect(SyncService.pauseSync).toHaveBeenCalled()
      })

      expect(result.current.isPaused).toBe(true)
    })

    it('should resume sync', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.resumeSync.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // First pause
      act(() => {
        result.current.pauseSync()
      })

      expect(result.current.isPaused).toBe(true)

      // Then resume
      act(() => {
        result.current.resumeSync()
      })

      await waitFor(() => {
        expect(SyncService.resumeSync).toHaveBeenCalled()
      })

      expect(result.current.isPaused).toBe(false)
    })

    it('should force sync', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.forceSync.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.forceSync()
      })

      expect(result.current.isForceSync).toBe(true)

      await waitFor(() => {
        expect(SyncService.forceSync).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(result.current.isForceSync).toBe(false)
      })
    })

    it('should retry failed sync', async () => {
      const { SyncService } = await import('../../services/sync.service')
      const errorStatus = createMockSyncStatus({
        ...mockSyncStatus,
        error: 'Sync failed',
      })

      SyncService.getStatus.mockResolvedValue(errorStatus)
      SyncService.retrySync.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.hasError).toBe(true)
      })

      act(() => {
        result.current.retrySync()
      })

      expect(result.current.isRetrying).toBe(true)

      await waitFor(() => {
        expect(SyncService.retrySync).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(result.current.isRetrying).toBe(false)
      })
    })

    it('should handle sync operation errors', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.forceSync.mockRejectedValue(new Error('Force sync failed'))

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.forceSync()
      })

      await waitFor(() => {
        expect(result.current.operationError).toBeTruthy()
      })

      expect(result.current.isForceSync).toBe(false)
    })
  })

  describe('Sync Queue Management', () => {
    it('should get sync queue', async () => {
      const { SyncService } = await import('../../services/sync.service')
      const mockQueue = [
        { id: '1', type: 'todo', action: 'create', data: { title: 'Test' } },
        { id: '2', type: 'todo', action: 'update', data: { id: '1', title: 'Updated' } },
      ]

      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.getSyncQueue.mockResolvedValue(mockQueue)

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.getSyncQueue()
      })

      await waitFor(() => {
        expect(result.current.syncQueue).toEqual(mockQueue)
      })

      expect(SyncService.getSyncQueue).toHaveBeenCalled()
    })

    it('should add item to sync queue', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.addToQueue.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const queueItem = {
        type: 'todo',
        action: 'create',
        data: { title: 'New Todo' },
      }

      act(() => {
        result.current.addToQueue(queueItem)
      })

      await waitFor(() => {
        expect(SyncService.addToQueue).toHaveBeenCalledWith(queueItem)
      })
    })

    it('should remove item from sync queue', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.removeFromQueue.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.removeFromQueue('queue-item-1')
      })

      await waitFor(() => {
        expect(SyncService.removeFromQueue).toHaveBeenCalledWith('queue-item-1')
      })
    })

    it('should clear sync queue', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.clearQueue.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.clearQueue()
      })

      await waitFor(() => {
        expect(SyncService.clearQueue).toHaveBeenCalled()
      })
    })
  })

  describe('Offline Support', () => {
    it('should handle offline mode', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const pendingChanges = [
        { id: '1', type: 'todo', action: 'create', data: { title: 'Offline Todo' } },
      ]

      OfflineService.isOnline.mockReturnValue(false)
      OfflineService.getPendingChanges.mockResolvedValue(pendingChanges)

      Object.defineProperty(navigator, 'onLine', { value: false })

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false)
      })

      expect(result.current.pendingChanges).toEqual(pendingChanges)
      expect(result.current.isOfflineMode).toBe(true)
    })

    it('should save changes when offline', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.savePendingChange.mockResolvedValue()

      Object.defineProperty(navigator, 'onLine', { value: false })

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false)
      })

      const change = {
        type: 'todo',
        action: 'create',
        data: { title: 'Offline Todo' },
      }

      act(() => {
        result.current.saveOfflineChange(change)
      })

      await waitFor(() => {
        expect(OfflineService.savePendingChange).toHaveBeenCalledWith(change)
      })
    })

    it('should sync pending changes when coming online', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const { SyncService } = await import('../../services/sync.service')
      
      const pendingChanges = [
        { id: '1', type: 'todo', action: 'create', data: { title: 'Offline Todo' } },
      ]

      OfflineService.getPendingChanges.mockResolvedValue(pendingChanges)
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.startSync.mockResolvedValue()

      // Start offline
      Object.defineProperty(navigator, 'onLine', { value: false })

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false)
      })

      // Come online
      Object.defineProperty(navigator, 'onLine', { value: true })
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true)
      })

      // Should automatically start sync
      await waitFor(() => {
        expect(SyncService.startSync).toHaveBeenCalled()
      })
    })

    it('should monitor offline storage usage', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const storageUsage = {
        used: 5.2, // MB
        available: 10, // MB
        percentage: 52,
      }

      OfflineService.getStorageUsage.mockResolvedValue(storageUsage)

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.storageUsage).toEqual(storageUsage)
      })
    })

    it('should warn when offline storage is nearly full', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      const nearFullStorage = {
        used: 9.5, // MB
        available: 10, // MB
        percentage: 95,
      }

      OfflineService.getStorageUsage.mockResolvedValue(nearFullStorage)

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.storageWarning).toBe('storage_nearly_full')
      })
    })

    it('should cleanup old offline data', async () => {
      const { OfflineService } = await import('../../services/offline.service')
      OfflineService.cleanupStorage.mockResolvedValue()

      const { result } = renderHook(() => useSync())

      act(() => {
        result.current.cleanupOfflineStorage()
      })

      await waitFor(() => {
        expect(OfflineService.cleanupStorage).toHaveBeenCalled()
      })
    })
  })

  describe('Real-time Updates', () => {
    it('should connect to WebSocket for real-time sync updates', async () => {
      const mockWebSocket = new MockWebSocket('ws://localhost:8080/sync')

      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.isWebSocketConnected).toBe(true)
      })

      // Simulate sync update
      act(() => {
        mockWebSocket.simulateMessage({
          type: 'sync_progress',
          data: { progress: 0.5 },
        })
      })

      expect(result.current.syncProgress).toBe(0.5)
    })

    it('should handle WebSocket connection errors', async () => {
      const { result } = renderHook(() => useSync())

      // Simulate WebSocket error
      act(() => {
        window.dispatchEvent(new CustomEvent('websocket-error', {
          detail: { error: 'Connection failed' }
        }))
      })

      await waitFor(() => {
        expect(result.current.isWebSocketConnected).toBe(false)
      })

      expect(result.current.connectionError).toBeTruthy()
    })

    it('should fallback to Server-Sent Events when WebSocket fails', async () => {
      const mockEventSource = new MockEventSource('/api/sync/events')

      const { result } = renderHook(() => useSync({
        fallbackToSSE: true,
      }))

      // Simulate WebSocket failure
      act(() => {
        window.dispatchEvent(new CustomEvent('websocket-error'))
      })

      await waitFor(() => {
        expect(result.current.isSSEConnected).toBe(true)
      })

      // Simulate SSE update
      act(() => {
        mockEventSource.simulateEvent('sync_update', {
          type: 'sync_completed',
          timestamp: new Date().toISOString(),
        })
      })

      expect(result.current.lastSyncUpdate).toBeTruthy()
    })

    it('should reconnect WebSocket after connection loss', async () => {
      const { result } = renderHook(() => useSync({
        autoReconnect: true,
      }))

      await waitFor(() => {
        expect(result.current.isWebSocketConnected).toBe(true)
      })

      // Simulate connection loss
      act(() => {
        window.dispatchEvent(new CustomEvent('websocket-close'))
      })

      expect(result.current.isWebSocketConnected).toBe(false)

      // Should automatically reconnect
      await waitFor(() => {
        expect(result.current.isWebSocketConnected).toBe(true)
      }, { timeout: 5000 })
    })
  })

  describe('Sync History and Analytics', () => {
    it('should get sync history', async () => {
      const { SyncService } = await import('../../services/sync.service')
      const mockHistory = [
        {
          id: '1',
          timestamp: '2024-01-01T12:00:00Z',
          type: 'manual',
          status: 'completed',
          itemsSync: 5,
          duration: 2000,
        },
        {
          id: '2',
          timestamp: '2024-01-01T11:00:00Z',
          type: 'automatic',
          status: 'completed',
          itemsSync: 2,
          duration: 800,
        },
      ]

      SyncService.getSyncHistory.mockResolvedValue(mockHistory)

      const { result } = renderHook(() => useSync())

      act(() => {
        result.current.getSyncHistory()
      })

      await waitFor(() => {
        expect(result.current.syncHistory).toEqual(mockHistory)
      })
    })

    it('should calculate sync statistics', async () => {
      const { result } = renderHook(() => useSync())

      await waitFor(() => {
        expect(result.current.syncStats).toBeDefined()
      })

      expect(result.current.syncStats).toEqual({
        totalSyncs: expect.any(Number),
        successRate: expect.any(Number),
        averageDuration: expect.any(Number),
        dataTransferred: expect.any(Number),
      })
    })

    it('should track sync performance metrics', async () => {
      const { result } = renderHook(() => useSync({
        trackPerformance: true,
      }))

      act(() => {
        result.current.startSync()
      })

      await waitFor(() => {
        expect(result.current.performanceMetrics).toBeDefined()
      })

      expect(result.current.performanceMetrics).toEqual({
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        duration: expect.any(Number),
        networkTime: expect.any(Number),
        processingTime: expect.any(Number),
      })
    })
  })

  describe('Configuration and Optimization', () => {
    it('should respect sync configuration', () => {
      const config = {
        autoSync: false,
        syncInterval: 30000, // 30 seconds
        batchSize: 10,
        retryAttempts: 3,
        retryDelay: 1000,
      }

      const { result } = renderHook(() => useSync(config))

      expect(result.current.config).toEqual(config)
      expect(result.current.autoSyncEnabled).toBe(false)
    })

    it('should adapt sync behavior based on network conditions', async () => {
      const { result } = renderHook(() => useSync({
        adaptiveSync: true,
      }))

      // Simulate slow network
      Object.defineProperty(navigator, 'connection', {
        value: {
          effectiveType: '2g',
          downlink: 0.5,
        },
      })

      act(() => {
        window.dispatchEvent(new Event('change'))
      })

      await waitFor(() => {
        expect(result.current.adaptiveBatchSize).toBeLessThan(10)
      })
    })

    it('should implement exponential backoff for retries', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.retrySync
        .mockRejectedValueOnce(new Error('Retry 1 failed'))
        .mockRejectedValueOnce(new Error('Retry 2 failed'))
        .mockResolvedValue()

      const { result } = renderHook(() => useSync({
        retryAttempts: 3,
        exponentialBackoff: true,
      }))

      act(() => {
        result.current.retrySync()
      })

      await waitFor(() => {
        expect(result.current.retryAttempts).toBeGreaterThan(0)
      })

      // Should eventually succeed
      await waitFor(() => {
        expect(result.current.retryAttempts).toBe(0)
      }, { timeout: 10000 })
    })

    it('should compress data for slow connections', async () => {
      const { result } = renderHook(() => useSync({
        compression: true,
      }))

      // Simulate slow connection
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '2g' },
      })

      act(() => {
        window.dispatchEvent(new Event('change'))
      })

      await waitFor(() => {
        expect(result.current.compressionEnabled).toBe(true)
      })
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle different types of sync errors', async () => {
      const { SyncService } = await import('../../services/sync.service')
      const networkError = new Error('Network error')
      networkError.name = 'NetworkError'

      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.startSync.mockRejectedValue(networkError)

      const { result } = renderHook(() => useSync())

      act(() => {
        result.current.startSync()
      })

      await waitFor(() => {
        expect(result.current.error?.type).toBe('network')
      })
    })

    it('should implement circuit breaker pattern', async () => {
      const { SyncService } = await import('../../services/sync.service')
      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      
      // Simulate multiple failures
      for (let i = 0; i < 5; i++) {
        SyncService.startSync.mockRejectedValueOnce(new Error('Sync failed'))
      }

      const { result } = renderHook(() => useSync({
        circuitBreakerThreshold: 3,
      }))

      // Make multiple failing sync attempts
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.startSync()
        })
        await waitFor(() => {
          expect(result.current.operationError).toBeTruthy()
        })
      }

      // Circuit breaker should be open
      await waitFor(() => {
        expect(result.current.circuitBreakerOpen).toBe(true)
      })
    })

    it('should provide detailed error information', async () => {
      const { SyncService } = await import('../../services/sync.service')
      const detailedError = new Error('Detailed sync error')
      detailedError.code = 'SYNC_001'
      detailedError.context = {
        operation: 'todo_update',
        itemId: 'todo-123',
        retryCount: 2,
      }

      SyncService.getStatus.mockResolvedValue(mockSyncStatus)
      SyncService.forceSync.mockRejectedValue(detailedError)

      const { result } = renderHook(() => useSync())

      act(() => {
        result.current.forceSync()
      })

      await waitFor(() => {
        expect(result.current.error?.code).toBe('SYNC_001')
        expect(result.current.error?.context).toBeDefined()
      })
    })
  })

  describe('Cleanup and Memory Management', () => {
    it('should cleanup WebSocket connection on unmount', () => {
      const { unmount } = renderHook(() => useSync())

      const closeSpy = vi.fn()
      MockWebSocket.prototype.close = closeSpy

      unmount()

      expect(closeSpy).toHaveBeenCalled()
    })

    it('should cleanup EventSource connection on unmount', () => {
      const { unmount } = renderHook(() => useSync({
        fallbackToSSE: true,
      }))

      const closeSpy = vi.fn()
      MockEventSource.prototype.close = closeSpy

      unmount()

      expect(closeSpy).toHaveBeenCalled()
    })

    it('should cancel pending operations on unmount', async () => {
      const { SyncService } = await import('../../services/sync.service')
      let syncPromise: Promise<void>
      
      SyncService.startSync.mockImplementation(() => {
        syncPromise = new Promise(() => {}) // Never resolving promise
        return syncPromise
      })

      const { result, unmount } = renderHook(() => useSync())

      act(() => {
        result.current.startSync()
      })

      expect(result.current.isSyncing).toBe(true)

      unmount()

      // Should cancel pending operations
      expect(result.current.isSyncing).toBe(false)
    })

    it('should clear timers and intervals on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      const { unmount } = renderHook(() => useSync({
        autoSync: true,
        syncInterval: 5000,
      }))

      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })
})