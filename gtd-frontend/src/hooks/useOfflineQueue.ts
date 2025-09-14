import { useCallback, useEffect, useRef, useState } from 'react'
import { OfflineService } from '../services/offline.service'
import { QueueService, QueueItem, QueueStats, ExportData } from '../services/queue.service'
import { ApiService } from '../services/api.service'

export interface UseOfflineQueueOptions {
  autoProcess?: boolean
  processInterval?: number
  maxRetries?: number
  exponentialBackoff?: boolean
  rateLimitDelay?: number
  trackProcessingTime?: boolean
  maxQueueSize?: number
  estimateProcessingTime?: boolean
  persistenceType?: 'indexeddb' | 'localstorage'
  compression?: boolean
  autoCleanup?: boolean
  cleanupAge?: number // milliseconds
  autoResolveConflicts?: boolean
}

export interface ProcessResults {
  processed: number
  succeeded: number
  failed: number
  errors: Error[]
}

export interface Conflict {
  queueItemId: string
  local: any
  remote: any
  type: string
}

export interface UseOfflineQueueReturn {
  // Queue state
  queue: QueueItem[]
  isLoading: boolean
  isProcessing: boolean
  isPaused: boolean
  retryInProgress: boolean
  isEmpty: boolean
  
  // Counts
  pendingCount: number
  failedCount: number
  completedCount: number
  
  // Current processing
  currentProcessingItem: QueueItem | null
  
  // Results and stats
  processResults: ProcessResults | null
  stats: QueueStats | null
  lastProcessingTime: number | null
  estimatedProcessingTime: number
  
  // Capacity monitoring
  isNearCapacity: boolean
  capacityWarning: string | null
  
  // Storage
  isStorageFull: boolean
  storageError: Error | null
  
  // Errors
  error: Error | null
  networkError: Error | null
  authError: Error | null
  importError: Error | null
  
  // Conflicts
  conflicts: Conflict[]
  corruptedItems: any[]
  
  // Actions - Todo operations
  addTodo: (data: any) => void
  updateTodo: (id: string, data: any) => void
  deleteTodo: (id: string) => void
  
  // Actions - Subtask operations
  addSubtask: (todoId: string, data: any) => void
  updateSubtask: (todoId: string, subtaskId: string, data: any) => void
  deleteSubtask: (todoId: string, subtaskId: string) => void
  
  // Queue management
  processQueue: () => void
  removeItem: (id: string) => void
  updateItem: (id: string, updates: any) => void
  clearQueue: () => void
  clearFailedItems: () => void
  reorderQueue: (sortBy: 'priority' | 'timestamp' | 'type') => void
  retryItem: (id: string) => void
  
  // Statistics and monitoring
  getStats: () => void
  
  // Data operations
  exportQueue: () => void
  importQueue: (data: string) => void
  compressQueue: () => void
  cleanupOldItems: () => void
  
  // Conflict resolution
  addConflict: (conflict: Conflict) => void
  resolveConflict: (queueItemId: string, resolution: 'local' | 'remote') => void
}

const DEFAULT_OPTIONS: Required<UseOfflineQueueOptions> = {
  autoProcess: false,
  processInterval: 30000, // 30 seconds
  maxRetries: 3,
  exponentialBackoff: true,
  rateLimitDelay: 0,
  trackProcessingTime: false,
  maxQueueSize: 1000,
  estimateProcessingTime: false,
  persistenceType: 'indexeddb',
  compression: false,
  autoCleanup: false,
  cleanupAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  autoResolveConflicts: false,
}

export function useOfflineQueue(options: UseOfflineQueueOptions = {}): UseOfflineQueueReturn {
  const config = { ...DEFAULT_OPTIONS, ...options }
  
  // State
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [retryInProgress, setRetryInProgress] = useState(false)
  const [currentProcessingItem, setCurrentProcessingItem] = useState<QueueItem | null>(null)
  const [processResults, setProcessResults] = useState<ProcessResults | null>(null)
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [lastProcessingTime, setLastProcessingTime] = useState<number | null>(null)
  const [isStorageFull, setIsStorageFull] = useState(false)
  const [storageError, setStorageError] = useState<Error | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [networkError, setNetworkError] = useState<Error | null>(null)
  const [authError, setAuthError] = useState<Error | null>(null)
  const [importError, setImportError] = useState<Error | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [corruptedItems, setCorruptedItems] = useState<any[]>([])
  
  // Refs
  const processIntervalRef = useRef<NodeJS.Timeout>()
  const rateLimitTimeoutRef = useRef<NodeJS.Timeout>()
  const lastRequestTimeRef = useRef<number>(0)
  const processingCancelRef = useRef<boolean>(false)
  
  // Computed values
  const isEmpty = queue.length === 0
  const pendingCount = queue.filter(item => item.status === 'pending').length
  const failedCount = queue.filter(item => item.status === 'failed').length
  const completedCount = queue.filter(item => item.status === 'completed').length
  const isNearCapacity = queue.length >= config.maxQueueSize * 0.9
  const capacityWarning = isNearCapacity 
    ? `Queue is ${Math.round((queue.length / config.maxQueueSize) * 100)}% full`
    : null

  const estimatedProcessingTime = config.estimateProcessingTime && stats
    ? (pendingCount + failedCount) * (stats.avgProcessingTime || 1000)
    : 0

  // Initialize queue
  useEffect(() => {
    const initializeQueue = async () => {
      try {
        const items = await OfflineService.getQueue()
        
        // Validate and separate corrupted items
        const validItems: QueueItem[] = []
        const corrupted: any[] = []
        
        items.forEach(item => {
          if (QueueService.validateQueueItem(item)) {
            validItems.push(item)
          } else {
            corrupted.push(item)
          }
        })
        
        setQueue(validItems)
        setCorruptedItems(corrupted)
        
        // Get initial stats
        const initialStats = await OfflineService.getQueueStats()
        setStats(initialStats)
        
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }
    
    initializeQueue()
  }, [])

  // Auto-process when coming online
  useEffect(() => {
    if (!config.autoProcess) return

    const handleOnline = () => {
      if (pendingCount > 0 || failedCount > 0) {
        processQueueOperation()
      }
    }

    const handleOffline = () => {
      setIsPaused(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [config.autoProcess, pendingCount, failedCount])

  // Auto-process interval
  useEffect(() => {
    if (!config.autoProcess || config.processInterval <= 0) return

    processIntervalRef.current = setInterval(() => {
      if (navigator.onLine && !isProcessing && !isPaused && (pendingCount > 0 || failedCount > 0)) {
        processQueueOperation()
      }
    }, config.processInterval)

    return () => {
      if (processIntervalRef.current) {
        clearInterval(processIntervalRef.current)
      }
    }
  }, [config.autoProcess, config.processInterval, isProcessing, isPaused, pendingCount, failedCount])

  // Rate limiting helper
  const withRateLimit = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    if (config.rateLimitDelay > 0) {
      const timeSinceLastRequest = Date.now() - lastRequestTimeRef.current
      const delay = Math.max(0, config.rateLimitDelay - timeSinceLastRequest)
      
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    lastRequestTimeRef.current = Date.now()
    return operation()
  }, [config.rateLimitDelay])

  // Process queue operation
  const processQueueOperation = useCallback(async () => {
    if (isProcessing || isPaused) return

    try {
      setIsProcessing(true)
      setNetworkError(null)
      setAuthError(null)
      processingCancelRef.current = false
      
      const itemsToProcess = queue
        .filter(item => item.status === 'pending' || (item.status === 'failed' && QueueService.shouldRetryItem(item, config.maxRetries)))
        .sort((a, b) => a.priority - b.priority)

      if (itemsToProcess.length === 0) {
        setIsProcessing(false)
        return
      }

      let processed = 0
      let succeeded = 0
      let failed = 0
      const errors: Error[] = []
      
      for (const item of itemsToProcess) {
        if (processingCancelRef.current) break

        setCurrentProcessingItem(item)
        
        const startTime = config.trackProcessingTime ? Date.now() : 0
        
        try {
          // Update item status to processing
          await OfflineService.updateQueueItem(item.id, { status: 'processing' })
          
          await withRateLimit(async () => {
            await processQueueItem(item)
          })
          
          const processingTime = config.trackProcessingTime ? Date.now() - startTime : undefined
          
          // Mark as completed
          await OfflineService.updateQueueItem(item.id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            ...(processingTime && { processingTime }),
          })
          
          succeeded++
          if (config.trackProcessingTime) {
            setLastProcessingTime(processingTime!)
          }
          
        } catch (err) {
          const error = err as Error
          failed++
          errors.push(error)
          
          // Handle different error types
          if (error.name === 'NetworkError' || !navigator.onLine) {
            setNetworkError(error)
          } else if (error.name === 'AuthenticationError') {
            setAuthError(error)
            setIsPaused(true) // Pause processing on auth errors
          } else if (error.name === 'ConflictError') {
            handleConflictError(item, error)
          }
          
          // Update retry count or mark as failed
          if (QueueService.shouldRetryItem(item, config.maxRetries)) {
            await OfflineService.updateQueueItem(item.id, {
              status: 'failed',
              retryCount: item.retryCount + 1,
              error: error.message,
            })
          } else {
            await OfflineService.updateQueueItem(item.id, {
              status: 'failed',
              error: error.message,
            })
          }
        }
        
        processed++
      }
      
      setProcessResults({ processed, succeeded, failed, errors })
      
      // Refresh queue
      const updatedQueue = await OfflineService.getQueue()
      setQueue(updatedQueue.filter(item => QueueService.validateQueueItem(item)))
      
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsProcessing(false)
      setCurrentProcessingItem(null)
    }
  }, [isProcessing, isPaused, queue, config.maxRetries, config.trackProcessingTime, withRateLimit])

  // Process individual queue item
  const processQueueItem = useCallback(async (item: QueueItem): Promise<void> => {
    const { type, action, data } = item

    if (type === 'todo') {
      switch (action) {
        case 'create':
          await ApiService.createTodo(data)
          break
        case 'update':
          await ApiService.updateTodo(data.id, data)
          break
        case 'delete':
          await ApiService.deleteTodo(data.id)
          break
      }
    } else if (type === 'subtask') {
      switch (action) {
        case 'create':
          await ApiService.createSubtask(data.todoId, data)
          break
        case 'update':
          await ApiService.updateSubtask(data.todoId, data.subtaskId, data)
          break
        case 'delete':
          await ApiService.deleteSubtask(data.todoId, data.subtaskId)
          break
      }
    } else {
      throw new Error(`Unknown queue item type: ${type}`)
    }
  }, [])

  // Handle conflict errors
  const handleConflictError = useCallback((item: QueueItem, error: any) => {
    const conflict: Conflict = {
      queueItemId: item.id,
      local: error.details?.local || item.data,
      remote: error.details?.remote || {},
      type: `${item.type}_${item.action}`,
    }
    
    if (config.autoResolveConflicts) {
      // Simple auto-resolution: prefer newer timestamp
      const localTime = new Date(conflict.local?.lastModified || conflict.local?.updatedAt || 0).getTime()
      const remoteTime = new Date(conflict.remote?.lastModified || conflict.remote?.updatedAt || 0).getTime()
      
      const resolution = localTime > remoteTime ? 'local' : 'remote'
      resolveConflictOperation(item.id, resolution)
    } else {
      setConflicts(prev => [...prev, conflict])
    }
  }, [config.autoResolveConflicts])

  // Queue item operations
  const addTodoOperation = useCallback(async (data: any) => {
    try {
      await OfflineService.addToQueue({
        type: 'todo',
        action: 'create',
        data,
        priority: QueueService.calculatePriority('todo', 'create'),
      })
      
      const updatedQueue = await OfflineService.getQueue()
      setQueue(updatedQueue.filter(item => QueueService.validateQueueItem(item)))
      
    } catch (err) {
      if ((err as Error).name === 'QuotaExceededError') {
        setStorageError(err as Error)
        setIsStorageFull(true)
      } else {
        setError(err as Error)
      }
    }
  }, [])

  const updateTodoOperation = useCallback(async (id: string, data: any) => {
    await addToQueueWithErrorHandling({
      type: 'todo',
      action: 'update',
      data: { id, ...data },
      priority: QueueService.calculatePriority('todo', 'update'),
    })
  }, [])

  const deleteTodoOperation = useCallback(async (id: string) => {
    await addToQueueWithErrorHandling({
      type: 'todo',
      action: 'delete',
      data: { id },
      priority: QueueService.calculatePriority('todo', 'delete'),
    })
  }, [])

  const addSubtaskOperation = useCallback(async (todoId: string, data: any) => {
    await addToQueueWithErrorHandling({
      type: 'subtask',
      action: 'create',
      data: { todoId, ...data },
      priority: QueueService.calculatePriority('subtask', 'create'),
    })
  }, [])

  const updateSubtaskOperation = useCallback(async (todoId: string, subtaskId: string, data: any) => {
    await addToQueueWithErrorHandling({
      type: 'subtask',
      action: 'update',
      data: { todoId, subtaskId, ...data },
      priority: QueueService.calculatePriority('subtask', 'update'),
    })
  }, [])

  const deleteSubtaskOperation = useCallback(async (todoId: string, subtaskId: string) => {
    await addToQueueWithErrorHandling({
      type: 'subtask',
      action: 'delete',
      data: { todoId, subtaskId },
      priority: QueueService.calculatePriority('subtask', 'delete'),
    })
  }, [])

  // Helper function for adding to queue with error handling
  const addToQueueWithErrorHandling = useCallback(async (item: any) => {
    try {
      await OfflineService.addToQueue(item)
      
      const updatedQueue = await OfflineService.getQueue()
      setQueue(updatedQueue.filter(item => QueueService.validateQueueItem(item)))
      
    } catch (err) {
      if ((err as Error).name === 'QuotaExceededError') {
        setStorageError(err as Error)
        setIsStorageFull(true)
      } else {
        setError(err as Error)
      }
    }
  }, [])

  // Queue management operations
  const removeItemOperation = useCallback(async (id: string) => {
    try {
      await OfflineService.removeFromQueue(id)
      setQueue(prev => prev.filter(item => item.id !== id))
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  const updateItemOperation = useCallback(async (id: string, updates: any) => {
    try {
      await OfflineService.updateQueueItem(id, updates)
      setQueue(prev => prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ))
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  const clearQueueOperation = useCallback(async () => {
    try {
      await OfflineService.clearQueue()
      setQueue([])
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  const clearFailedItemsOperation = useCallback(async () => {
    try {
      const failedItems = queue.filter(item => item.status === 'failed')
      for (const item of failedItems) {
        await OfflineService.removeFromQueue(item.id)
      }
      setQueue(prev => prev.filter(item => item.status !== 'failed'))
    } catch (err) {
      setError(err as Error)
    }
  }, [queue])

  const reorderQueueOperation = useCallback((sortBy: 'priority' | 'timestamp' | 'type') => {
    setQueue(prev => [...prev].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return a.priority - b.priority
        case 'timestamp':
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        case 'type':
          return a.type.localeCompare(b.type)
        default:
          return 0
      }
    }))
  }, [])

  const retryItemOperation = useCallback(async (id: string) => {
    try {
      setRetryInProgress(true)
      
      const item = queue.find(q => q.id === id)
      if (!item || !QueueService.shouldRetryItem(item, config.maxRetries)) {
        return
      }
      
      const delay = QueueService.calculateRetryDelay(item.retryCount, config.exponentialBackoff)
      
      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, delay))
      
      // Update retry count and status
      await OfflineService.updateQueueItem(id, {
        status: 'pending',
        retryCount: item.retryCount + 1,
        error: undefined,
      })
      
      // Refresh queue
      const updatedQueue = await OfflineService.getQueue()
      setQueue(updatedQueue.filter(item => QueueService.validateQueueItem(item)))
      
    } catch (err) {
      setError(err as Error)
    } finally {
      setRetryInProgress(false)
    }
  }, [queue, config.maxRetries, config.exponentialBackoff])

  // Statistics operation
  const getStatsOperation = useCallback(async () => {
    try {
      const queueStats = await OfflineService.getQueueStats()
      setStats(queueStats)
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  // Data operations
  const exportQueueOperation = useCallback(async () => {
    try {
      const exportData = await OfflineService.exportQueue()
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
      }
      
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  const importQueueOperation = useCallback(async (data: string) => {
    try {
      setImportError(null)
      
      const parsed = JSON.parse(data)
      
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid queue format: missing items array')
      }
      
      // Validate items
      const validItems = parsed.items.filter(item => QueueService.validateQueueItem(item))
      
      if (validItems.length !== parsed.items.length) {
        throw new Error('Invalid queue format: some items are malformed')
      }
      
      await OfflineService.importQueue(validItems)
      
      // Refresh queue
      const updatedQueue = await OfflineService.getQueue()
      setQueue(updatedQueue.filter(item => QueueService.validateQueueItem(item)))
      
    } catch (err) {
      setImportError(err as Error)
    }
  }, [])

  const compressQueueOperation = useCallback(async () => {
    try {
      await OfflineService.compressQueue()
      
      // Refresh queue
      const updatedQueue = await OfflineService.getQueue()
      setQueue(updatedQueue.filter(item => QueueService.validateQueueItem(item)))
      
    } catch (err) {
      setError(err as Error)
    }
  }, [])

  const cleanupOldItemsOperation = useCallback(async () => {
    try {
      const cutoffTime = new Date(Date.now() - config.cleanupAge).toISOString()
      const itemsToRemove = queue.filter(item => 
        item.status === 'completed' && 
        item.completedAt && 
        item.completedAt < cutoffTime
      )
      
      for (const item of itemsToRemove) {
        await OfflineService.removeFromQueue(item.id)
      }
      
      setQueue(prev => prev.filter(item => 
        !(item.status === 'completed' && 
          item.completedAt && 
          item.completedAt < cutoffTime)
      ))
      
    } catch (err) {
      setError(err as Error)
    }
  }, [queue, config.cleanupAge])

  // Conflict operations
  const addConflictOperation = useCallback((conflict: Conflict) => {
    setConflicts(prev => [...prev, conflict])
  }, [])

  const resolveConflictOperation = useCallback(async (queueItemId: string, resolution: 'local' | 'remote') => {
    try {
      const conflict = conflicts.find(c => c.queueItemId === queueItemId)
      if (!conflict) return
      
      const resolvedData = resolution === 'local' ? conflict.local : conflict.remote
      
      await OfflineService.updateQueueItem(queueItemId, {
        data: resolvedData,
        status: 'pending', // Reset to pending for reprocessing
      })
      
      setConflicts(prev => prev.filter(c => c.queueItemId !== queueItemId))
      
      // Refresh queue
      const updatedQueue = await OfflineService.getQueue()
      setQueue(updatedQueue.filter(item => QueueService.validateQueueItem(item)))
      
    } catch (err) {
      setError(err as Error)
    }
  }, [conflicts])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processingCancelRef.current = true
      
      if (processIntervalRef.current) {
        clearInterval(processIntervalRef.current)
      }
      if (rateLimitTimeoutRef.current) {
        clearTimeout(rateLimitTimeoutRef.current)
      }
    }
  }, [])

  return {
    // Queue state
    queue,
    isLoading,
    isProcessing,
    isPaused,
    retryInProgress,
    isEmpty,
    
    // Counts
    pendingCount,
    failedCount,
    completedCount,
    
    // Current processing
    currentProcessingItem,
    
    // Results and stats
    processResults,
    stats,
    lastProcessingTime,
    estimatedProcessingTime,
    
    // Capacity monitoring
    isNearCapacity,
    capacityWarning,
    
    // Storage
    isStorageFull,
    storageError,
    
    // Errors
    error,
    networkError,
    authError,
    importError,
    
    // Conflicts
    conflicts,
    corruptedItems,
    
    // Actions - Todo operations
    addTodo: addTodoOperation,
    updateTodo: updateTodoOperation,
    deleteTodo: deleteTodoOperation,
    
    // Actions - Subtask operations
    addSubtask: addSubtaskOperation,
    updateSubtask: updateSubtaskOperation,
    deleteSubtask: deleteSubtaskOperation,
    
    // Queue management
    processQueue: processQueueOperation,
    removeItem: removeItemOperation,
    updateItem: updateItemOperation,
    clearQueue: clearQueueOperation,
    clearFailedItems: clearFailedItemsOperation,
    reorderQueue: reorderQueueOperation,
    retryItem: retryItemOperation,
    
    // Statistics and monitoring
    getStats: getStatsOperation,
    
    // Data operations
    exportQueue: exportQueueOperation,
    importQueue: importQueueOperation,
    compressQueue: compressQueueOperation,
    cleanupOldItems: cleanupOldItemsOperation,
    
    // Conflict resolution
    addConflict: addConflictOperation,
    resolveConflict: resolveConflictOperation,
  }
}