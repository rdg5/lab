export interface QueueItem {
  id: string
  type: string
  action: 'create' | 'update' | 'delete'
  data: any
  timestamp: string
  retryCount: number
  priority: number
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying'
  completedAt?: string
  error?: string
  processingTime?: number
}

export interface QueueStats {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  avgProcessingTime: number
  successRate: number
}

export interface ExportData {
  version: string
  timestamp: string
  items: QueueItem[]
}

class QueueServiceClass {
  private readonly DB_NAME = 'GTDQueueDB'
  private readonly DB_VERSION = 1
  private readonly QUEUE_STORE = 'queueItems'
  private readonly STATS_STORE = 'queueStats'
  
  private db: IDBDatabase | null = null

  async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create queue items store
        if (!db.objectStoreNames.contains(this.QUEUE_STORE)) {
          const queueStore = db.createObjectStore(this.QUEUE_STORE, { keyPath: 'id' })
          queueStore.createIndex('timestamp', 'timestamp')
          queueStore.createIndex('type', 'type')
          queueStore.createIndex('status', 'status')
          queueStore.createIndex('priority', 'priority')
          queueStore.createIndex('retryCount', 'retryCount')
        }

        // Create stats store
        if (!db.objectStoreNames.contains(this.STATS_STORE)) {
          const statsStore = db.createObjectStore(this.STATS_STORE, { keyPath: 'key' })
        }
      }
    })
  }

  async getQueue(): Promise<QueueItem[]> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.QUEUE_STORE], 'readonly')
      const store = transaction.objectStore(this.QUEUE_STORE)
      const request = store.getAll()

      request.onsuccess = () => {
        const items = request.result.sort((a, b) => {
          // Sort by priority first, then by timestamp
          if (a.priority !== b.priority) {
            return a.priority - b.priority
          }
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        })
        resolve(items)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async addToQueue(item: Omit<QueueItem, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    const queueItem: QueueItem = {
      ...item,
      id: this.generateQueueId(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.QUEUE_STORE], 'readwrite')
      const store = transaction.objectStore(this.QUEUE_STORE)
      const request = store.add(queueItem)

      request.onsuccess = () => resolve()
      request.onerror = () => {
        if (request.error?.name === 'QuotaExceededError') {
          const error = new Error('Storage quota exceeded')
          error.name = 'QuotaExceededError'
          reject(error)
        } else {
          reject(request.error)
        }
      }
    })
  }

  async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.QUEUE_STORE], 'readwrite')
      const store = transaction.objectStore(this.QUEUE_STORE)
      const getRequest = store.get(id)

      getRequest.onsuccess = () => {
        const item = getRequest.result
        if (item) {
          const updatedItem = { ...item, ...updates }
          const putRequest = store.put(updatedItem)
          putRequest.onsuccess = () => resolve()
          putRequest.onerror = () => reject(putRequest.error)
        } else {
          resolve() // Item doesn't exist, consider it updated
        }
      }
      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  async removeFromQueue(id: string): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.QUEUE_STORE], 'readwrite')
      const store = transaction.objectStore(this.QUEUE_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clearQueue(): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.QUEUE_STORE], 'readwrite')
      const store = transaction.objectStore(this.QUEUE_STORE)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async processQueue(): Promise<void> {
    // This method would be implemented to process queue items
    // For now, it's a placeholder that the hook will handle
    return Promise.resolve()
  }

  async getQueueStats(): Promise<QueueStats> {
    const items = await this.getQueue()
    
    const total = items.length
    const pending = items.filter(item => item.status === 'pending').length
    const processing = items.filter(item => item.status === 'processing').length
    const completed = items.filter(item => item.status === 'completed').length
    const failed = items.filter(item => item.status === 'failed').length
    
    const completedItems = items.filter(item => item.status === 'completed' && item.processingTime)
    const avgProcessingTime = completedItems.length > 0
      ? completedItems.reduce((sum, item) => sum + (item.processingTime || 0), 0) / completedItems.length
      : 0
    
    const successRate = total > 0 ? completed / total : 0

    return {
      total,
      pending,
      processing,
      completed,
      failed,
      avgProcessingTime,
      successRate,
    }
  }

  async exportQueue(): Promise<ExportData> {
    const items = await this.getQueue()
    
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      items,
    }
  }

  async importQueue(items: QueueItem[]): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.QUEUE_STORE], 'readwrite')
      const store = transaction.objectStore(this.QUEUE_STORE)
      
      let completed = 0
      const total = items.length

      if (total === 0) {
        resolve()
        return
      }

      items.forEach(item => {
        const request = store.add(item)
        
        request.onsuccess = () => {
          completed++
          if (completed === total) {
            resolve()
          }
        }
        
        request.onerror = () => {
          reject(request.error)
        }
      })
    })
  }

  async compressQueue(): Promise<void> {
    // Remove completed items older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const items = await this.getQueue()
    
    const itemsToRemove = items.filter(item => 
      item.status === 'completed' && 
      item.completedAt && 
      item.completedAt < sevenDaysAgo
    )

    for (const item of itemsToRemove) {
      await this.removeFromQueue(item.id)
    }
  }

  private generateQueueId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Utility methods
  calculatePriority(type: string, action: string): number {
    const typeWeight = {
      todo: 10,
      subtask: 5,
      user: 15,
    }[type] || 10

    const actionWeight = {
      delete: 30,
      update: 20,
      create: 10,
    }[action] || 10

    return typeWeight + actionWeight
  }

  shouldRetryItem(item: QueueItem, maxRetries = 3): boolean {
    return item.retryCount < maxRetries && item.status === 'failed'
  }

  calculateRetryDelay(retryCount: number, exponentialBackoff = true): number {
    if (!exponentialBackoff) {
      return 1000 // Fixed 1 second delay
    }

    // Exponential backoff: 1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, retryCount), 30000) // Max 30 seconds
  }

  validateQueueItem(item: any): item is QueueItem {
    return (
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.type === 'string' &&
      ['create', 'update', 'delete'].includes(item.action) &&
      typeof item.data === 'object' &&
      typeof item.timestamp === 'string' &&
      typeof item.retryCount === 'number' &&
      typeof item.priority === 'number' &&
      ['pending', 'processing', 'completed', 'failed', 'retrying'].includes(item.status)
    )
  }
}

export const QueueService = new QueueServiceClass()