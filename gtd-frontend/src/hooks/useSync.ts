import { useCallback, useEffect, useRef, useState } from 'react'
import { SyncService, SyncQueueItem, SyncHistoryItem, SyncStatistics } from '../services/sync.service'
import { OfflineService, StorageUsage, OfflineChange } from '../services/offline.service'
import { SyncStatus } from '../test/utils/test-utils'

export interface UseSyncOptions {
  autoSync?: boolean
  syncInterval?: number // milliseconds
  batchSize?: number
  retryAttempts?: number
  retryDelay?: number
  exponentialBackoff?: boolean
  batterySaveMode?: boolean
  adaptiveSync?: boolean
  compression?: boolean
  trackPerformance?: boolean
  fallbackToSSE?: boolean
  autoReconnect?: boolean
  circuitBreakerThreshold?: number
}

export interface SyncError {
  type: 'network' | 'server' | 'conflict' | 'storage' | 'unknown'
  message: string
  code?: string
  context?: any
  timestamp: Date
}

export interface PerformanceMetrics {
  startTime: number
  endTime: number
  duration: number
  networkTime: number
  processingTime: number
}

export interface UseSyncReturn {
  // Status
  status: SyncStatus
  isLoading: boolean
  isOnline: boolean
  isSyncing: boolean
  isPaused: boolean
  isForceSync: boolean
  isRetrying: boolean
  hasError: boolean
  isOfflineMode: boolean
  
  // Connection
  connectionQuality: 'good' | 'fair' | 'slow' | 'offline'
  isWebSocketConnected: boolean
  isSSEConnected: boolean
  connectionError: Error | null
  
  // Sync data
  syncQueue: SyncQueueItem[]
  syncHistory: SyncHistoryItem[]
  syncStats: SyncStatistics
  syncProgress: number
  lastSyncUpdate: Date | null
  
  // Offline
  pendingChanges: OfflineChange[]
  storageUsage: StorageUsage
  storageWarning: 'storage_nearly_full' | 'storage_full' | null
  
  // Configuration
  config: Required<UseSyncOptions>
  autoSyncEnabled: boolean
  adaptiveBatchSize: number
  compressionEnabled: boolean
  circuitBreakerOpen: boolean
  retryAttempts: number
  
  // Performance
  performanceMetrics: PerformanceMetrics | null
  
  // Errors
  error: SyncError | null
  operationError: Error | null
  
  // Actions
  startSync: () => void
  pauseSync: () => void
  resumeSync: () => void
  forceSync: () => void
  retrySync: () => void
  updateStatus: (status: SyncStatus) => void
  
  // Queue management
  getSyncQueue: () => void
  addToQueue: (item: Omit<SyncQueueItem, 'id' | 'timestamp'>) => void
  removeFromQueue: (itemId: string) => void
  clearQueue: () => void
  
  // Offline operations
  saveOfflineChange: (change: Omit<OfflineChange, 'id' | 'timestamp' | 'synced'>) => void
  cleanupOfflineStorage: () => void
  
  // History and analytics
  getSyncHistory: () => void
}

const DEFAULT_CONFIG: Required<UseSyncOptions> = {
  autoSync: true,
  syncInterval: 60000, // 1 minute
  batchSize: 50,
  retryAttempts: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  batterySaveMode: false,
  adaptiveSync: false,
  compression: false,
  trackPerformance: false,
  fallbackToSSE: false,
  autoReconnect: true,
  circuitBreakerThreshold: 5,
}

export function useSync(options: UseSyncOptions = {}): UseSyncReturn {
  const config = { ...DEFAULT_CONFIG, ...options }
  
  // State
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    syncInProgress: false,
    pendingChanges: 0,
    lastSync: null,
    error: null,
  })
  
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isForceSync, setIsForceSync] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'slow' | 'offline'>('good')
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false)
  const [isSSEConnected, setIsSSEConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<Error | null>(null)
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([])
  const [syncHistory, setSyncHistory] = useState<SyncHistoryItem[]>([])
  const [syncStats, setSyncStats] = useState<SyncStatistics>({
    totalSyncs: 0,
    successRate: 0,
    averageDuration: 0,
    dataTransferred: 0,
  })
  const [syncProgress, setSyncProgress] = useState(0)
  const [lastSyncUpdate, setLastSyncUpdate] = useState<Date | null>(null)
  const [pendingChanges, setPendingChanges] = useState<OfflineChange[]>([])
  const [storageUsage, setStorageUsage] = useState<StorageUsage>({ used: 0, available: 0, percentage: 0 })
  const [storageWarning, setStorageWarning] = useState<'storage_nearly_full' | 'storage_full' | null>(null)
  const [adaptiveBatchSize, setAdaptiveBatchSize] = useState(config.batchSize)
  const [compressionEnabled, setCompressionEnabled] = useState(config.compression)
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false)
  const [retryAttempts, setRetryAttempts] = useState(0)
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null)
  const [error, setError] = useState<SyncError | null>(null)
  const [operationError, setOperationError] = useState<Error | null>(null)
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const syncIntervalRef = useRef<NodeJS.Timeout>()
  const retryTimeoutRef = useRef<NodeJS.Timeout>()
  const circuitBreakerResetRef = useRef<NodeJS.Timeout>()
  const performanceStartRef = useRef<number>()
  const failureCountRef = useRef(0)
  
  // Computed values
  const hasError = !!status.error || !!error || !!operationError
  const isOfflineMode = !isOnline || connectionQuality === 'offline'
  const autoSyncEnabled = config.autoSync && !isPaused && !circuitBreakerOpen

  // Initialize sync status
  useEffect(() => {
    const initializeSync = async () => {
      try {
        const initialStatus = await SyncService.getStatus()
        setStatus(initialStatus)
        setIsSyncing(initialStatus.syncInProgress)
        
        // Load pending changes
        const changes = await OfflineService.getPendingChanges()
        setPendingChanges(changes)
        
        // Load storage usage
        const usage = await OfflineService.getStorageUsage()
        setStorageUsage(usage)
        updateStorageWarning(usage)
        
        // Load sync stats
        const stats = await SyncService.getSyncStatistics()
        setSyncStats(stats)
        
      } catch (err) {
        const syncError = createSyncError(err as Error, 'Failed to initialize sync')
        setError(syncError)
      } finally {
        setIsLoading(false)
      }
    }
    
    initializeSync()
  }, [])

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      updateConnectionQuality()
      
      // Auto-start sync when coming online
      if (autoSyncEnabled) {
        startSyncOperation()
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      setConnectionQuality('offline')
    }

    const handleConnectionChange = () => {
      updateConnectionQuality()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Monitor connection quality
    const connection = (navigator as any).connection
    if (connection) {
      connection.addEventListener('change', handleConnectionChange)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange)
      }
    }
  }, [autoSyncEnabled])

  // Battery save mode monitoring
  useEffect(() => {
    if (!config.batterySaveMode) return

    const checkBatteryStatus = async () => {
      if ('getBattery' in navigator) {
        try {
          const battery = await (navigator as any).getBattery()
          const isLowBattery = battery.level < 0.2 && !battery.charging
          const isSlowConnection = connectionQuality === 'slow'
          
          if (isLowBattery && isSlowConnection && !isPaused) {
            pauseSyncOperation()
          }
        } catch (error) {
          console.warn('Battery API not available:', error)
        }
      }
    }

    checkBatteryStatus()
  }, [config.batterySaveMode, connectionQuality, isPaused])

  // WebSocket connection
  useEffect(() => {
    if (!config.autoReconnect) return

    const connectWebSocket = () => {
      try {
        const wsUrl = process.env.VITE_WS_URL || 'ws://localhost:3000/sync'
        wsRef.current = new WebSocket(wsUrl)

        wsRef.current.onopen = () => {
          setIsWebSocketConnected(true)
          setConnectionError(null)
          failureCountRef.current = 0
        }

        wsRef.current.onclose = () => {
          setIsWebSocketConnected(false)
          
          // Auto-reconnect with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, failureCountRef.current), 30000)
          setTimeout(connectWebSocket, delay)
        }

        wsRef.current.onerror = (event) => {
          setConnectionError(new Error('WebSocket connection failed'))
          failureCountRef.current++
          
          // Fallback to SSE if enabled
          if (config.fallbackToSSE) {
            connectSSE()
          }
        }

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            handleRealtimeUpdate(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

      } catch (error) {
        setConnectionError(error as Error)
        if (config.fallbackToSSE) {
          connectSSE()
        }
      }
    }

    const connectSSE = () => {
      if (sseRef.current) return

      try {
        const sseUrl = `${process.env.VITE_API_URL || 'http://localhost:3000'}/api/sync/events`
        sseRef.current = new EventSource(sseUrl)

        sseRef.current.onopen = () => {
          setIsSSEConnected(true)
          setConnectionError(null)
        }

        sseRef.current.onerror = () => {
          setIsSSEConnected(false)
          setConnectionError(new Error('SSE connection failed'))
        }

        sseRef.current.addEventListener('sync_update', (event) => {
          try {
            const data = JSON.parse(event.data)
            handleRealtimeUpdate(data)
          } catch (error) {
            console.error('Failed to parse SSE message:', error)
          }
        })

      } catch (error) {
        setConnectionError(error as Error)
      }
    }

    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (sseRef.current) {
        sseRef.current.close()
      }
    }
  }, [config.autoReconnect, config.fallbackToSSE])

  // Auto-sync interval
  useEffect(() => {
    if (!autoSyncEnabled) return

    syncIntervalRef.current = setInterval(() => {
      if (isOnline && !isSyncing && !isPaused) {
        startSyncOperation()
      }
    }, config.syncInterval)

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
      }
    }
  }, [autoSyncEnabled, isOnline, isSyncing, isPaused, config.syncInterval])

  // Utility functions
  const updateConnectionQuality = useCallback(() => {
    const quality = OfflineService.getConnectionQuality()
    setConnectionQuality(quality)
    
    // Adaptive sync adjustments
    if (config.adaptiveSync) {
      switch (quality) {
        case 'slow':
          setAdaptiveBatchSize(Math.max(5, Math.floor(config.batchSize / 4)))
          setCompressionEnabled(true)
          break
        case 'fair':
          setAdaptiveBatchSize(Math.max(10, Math.floor(config.batchSize / 2)))
          break
        case 'good':
        default:
          setAdaptiveBatchSize(config.batchSize)
          setCompressionEnabled(config.compression)
          break
      }
    }
  }, [config.adaptiveSync, config.batchSize, config.compression])

  const updateStorageWarning = useCallback((usage: StorageUsage) => {
    if (usage.percentage >= 98) {
      setStorageWarning('storage_full')
    } else if (usage.percentage >= 90) {
      setStorageWarning('storage_nearly_full')
    } else {
      setStorageWarning(null)
    }
  }, [])

  const createSyncError = useCallback((error: Error, context: string): SyncError => {
    let type: SyncError['type'] = 'unknown'
    
    if (error.name === 'NetworkError' || !navigator.onLine) {
      type = 'network'
    } else if (error.name === 'ServerError') {
      type = 'server'
    } else if (error.name === 'ConflictError') {
      type = 'conflict'
    } else if (error.message.includes('storage') || error.message.includes('quota')) {
      type = 'storage'
    }

    return {
      type,
      message: error.message,
      code: (error as any).code,
      context: { originalContext: context, ...((error as any).context || {}) },
      timestamp: new Date(),
    }
  }, [])

  const handleRealtimeUpdate = useCallback((message: any) => {
    switch (message.type) {
      case 'sync_progress':
        setSyncProgress(message.data.progress || 0)
        break
      case 'sync_completed':
        setIsSyncing(false)
        setIsForceSync(false)
        setIsRetrying(false)
        setSyncProgress(1)
        setLastSyncUpdate(new Date())
        break
      case 'sync_error':
        setIsSyncing(false)
        setIsForceSync(false)
        setIsRetrying(false)
        setSyncProgress(0)
        const syncError = createSyncError(new Error(message.data.error), 'Real-time sync update')
        setError(syncError)
        break
      case 'queue_updated':
        setSyncQueue(message.data.queue || [])
        break
    }
  }, [createSyncError])

  const handleCircuitBreaker = useCallback((error: Error) => {
    failureCountRef.current++
    
    if (failureCountRef.current >= config.circuitBreakerThreshold) {
      setCircuitBreakerOpen(true)
      
      // Reset circuit breaker after 5 minutes
      circuitBreakerResetRef.current = setTimeout(() => {
        setCircuitBreakerOpen(false)
        failureCountRef.current = 0
      }, 5 * 60 * 1000)
    }
  }, [config.circuitBreakerThreshold])

  // Operation functions
  const startSyncOperation = useCallback(async () => {
    if (circuitBreakerOpen || isSyncing) return

    try {
      setIsSyncing(true)
      setOperationError(null)
      setError(null)
      
      if (config.trackPerformance) {
        performanceStartRef.current = performance.now()
      }
      
      await SyncService.startSync()
      failureCountRef.current = 0 // Reset failure count on success
      
    } catch (error) {
      const syncError = createSyncError(error as Error, 'Start sync operation')
      setError(syncError)
      setOperationError(error as Error)
      handleCircuitBreaker(error as Error)
    } finally {
      setIsSyncing(false)
      
      if (config.trackPerformance && performanceStartRef.current) {
        const endTime = performance.now()
        const duration = endTime - performanceStartRef.current
        setPerformanceMetrics({
          startTime: performanceStartRef.current,
          endTime,
          duration,
          networkTime: duration * 0.7, // Estimate
          processingTime: duration * 0.3, // Estimate
        })
      }
    }
  }, [circuitBreakerOpen, isSyncing, config.trackPerformance, createSyncError, handleCircuitBreaker])

  const pauseSyncOperation = useCallback(async () => {
    try {
      await SyncService.pauseSync()
      setIsPaused(true)
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [])

  const resumeSyncOperation = useCallback(async () => {
    try {
      await SyncService.resumeSync()
      setIsPaused(false)
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [])

  const forceSyncOperation = useCallback(async () => {
    if (circuitBreakerOpen) return

    try {
      setIsForceSync(true)
      setOperationError(null)
      await SyncService.forceSync()
    } catch (error) {
      setOperationError(error as Error)
      handleCircuitBreaker(error as Error)
    } finally {
      setIsForceSync(false)
    }
  }, [circuitBreakerOpen, handleCircuitBreaker])

  const retrySyncOperation = useCallback(async () => {
    if (retryAttempts >= config.retryAttempts) return

    try {
      setIsRetrying(true)
      setRetryAttempts(prev => prev + 1)
      
      const delay = config.exponentialBackoff 
        ? SyncService.calculateRetryDelay(retryAttempts, true)
        : config.retryDelay
      
      await new Promise(resolve => setTimeout(resolve, delay))
      await SyncService.retrySync()
      
      // Reset retry count on success
      setRetryAttempts(0)
      
    } catch (error) {
      setOperationError(error as Error)
      
      if (retryAttempts >= config.retryAttempts - 1) {
        const syncError = createSyncError(error as Error, 'Retry sync operation - max attempts reached')
        setError(syncError)
      }
    } finally {
      setIsRetrying(false)
    }
  }, [retryAttempts, config.retryAttempts, config.exponentialBackoff, config.retryDelay, createSyncError])

  // Queue operations
  const getSyncQueueOperation = useCallback(async () => {
    try {
      const queue = await SyncService.getSyncQueue()
      setSyncQueue(queue)
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [])

  const addToQueueOperation = useCallback(async (item: Omit<SyncQueueItem, 'id' | 'timestamp'>) => {
    try {
      await SyncService.addToQueue(item)
      getSyncQueueOperation() // Refresh queue
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [getSyncQueueOperation])

  const removeFromQueueOperation = useCallback(async (itemId: string) => {
    try {
      await SyncService.removeFromQueue(itemId)
      getSyncQueueOperation() // Refresh queue
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [getSyncQueueOperation])

  const clearQueueOperation = useCallback(async () => {
    try {
      await SyncService.clearQueue()
      setSyncQueue([])
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [])

  // Offline operations
  const saveOfflineChangeOperation = useCallback(async (change: Omit<OfflineChange, 'id' | 'timestamp' | 'synced'>) => {
    try {
      await OfflineService.savePendingChange(change)
      const updatedChanges = await OfflineService.getPendingChanges()
      setPendingChanges(updatedChanges)
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [])

  const cleanupOfflineStorageOperation = useCallback(async () => {
    try {
      await OfflineService.cleanupStorage()
      const usage = await OfflineService.getStorageUsage()
      setStorageUsage(usage)
      updateStorageWarning(usage)
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [updateStorageWarning])

  // History operations
  const getSyncHistoryOperation = useCallback(async () => {
    try {
      const history = await SyncService.getSyncHistory(50)
      setSyncHistory(history)
    } catch (error) {
      setOperationError(error as Error)
    }
  }, [])

  const updateStatusOperation = useCallback((newStatus: SyncStatus) => {
    setStatus(newStatus)
    setIsSyncing(newStatus.syncInProgress)
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (circuitBreakerResetRef.current) {
        clearTimeout(circuitBreakerResetRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (sseRef.current) {
        sseRef.current.close()
      }
    }
  }, [])

  return {
    // Status
    status,
    isLoading,
    isOnline,
    isSyncing,
    isPaused,
    isForceSync,
    isRetrying,
    hasError,
    isOfflineMode,
    
    // Connection
    connectionQuality,
    isWebSocketConnected,
    isSSEConnected,
    connectionError,
    
    // Sync data
    syncQueue,
    syncHistory,
    syncStats,
    syncProgress,
    lastSyncUpdate,
    
    // Offline
    pendingChanges,
    storageUsage,
    storageWarning,
    
    // Configuration
    config,
    autoSyncEnabled,
    adaptiveBatchSize,
    compressionEnabled,
    circuitBreakerOpen,
    retryAttempts,
    
    // Performance
    performanceMetrics,
    
    // Errors
    error,
    operationError,
    
    // Actions
    startSync: startSyncOperation,
    pauseSync: pauseSyncOperation,
    resumeSync: resumeSyncOperation,
    forceSync: forceSyncOperation,
    retrySync: retrySyncOperation,
    updateStatus: updateStatusOperation,
    
    // Queue management
    getSyncQueue: getSyncQueueOperation,
    addToQueue: addToQueueOperation,
    removeFromQueue: removeFromQueueOperation,
    clearQueue: clearQueueOperation,
    
    // Offline operations
    saveOfflineChange: saveOfflineChangeOperation,
    cleanupOfflineStorage: cleanupOfflineStorageOperation,
    
    // History and analytics
    getSyncHistory: getSyncHistoryOperation,
  }
}