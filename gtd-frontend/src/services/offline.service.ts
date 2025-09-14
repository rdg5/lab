import { OfflineChange } from '../test/utils/test-utils'

export interface StorageUsage {
  used: number // MB
  available: number // MB
  percentage: number
}

export interface OfflineChange extends Record<string, any> {
  id: string
  type: string
  action: 'create' | 'update' | 'delete'
  data: any
  timestamp: string
  synced: boolean
}

class OfflineServiceClass {
  private readonly DB_NAME = 'GTDOfflineDB'
  private readonly DB_VERSION = 1
  private readonly CHANGES_STORE = 'pendingChanges'
  private readonly CACHE_STORE = 'cachedData'
  
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

        // Create pending changes store
        if (!db.objectStoreNames.contains(this.CHANGES_STORE)) {
          const changesStore = db.createObjectStore(this.CHANGES_STORE, { keyPath: 'id' })
          changesStore.createIndex('timestamp', 'timestamp')
          changesStore.createIndex('type', 'type')
          changesStore.createIndex('synced', 'synced')
        }

        // Create cached data store
        if (!db.objectStoreNames.contains(this.CACHE_STORE)) {
          const cacheStore = db.createObjectStore(this.CACHE_STORE, { keyPath: 'key' })
          cacheStore.createIndex('expiry', 'expiry')
        }
      }
    })
  }

  isOnline(): boolean {
    return navigator.onLine && this.hasNetworkConnection()
  }

  private hasNetworkConnection(): boolean {
    // Additional check beyond navigator.onLine
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    
    if (!connection) {
      return true // Assume connection if API not available
    }

    // Check if we have a meaningful connection
    return connection.effectiveType !== 'slow-2g' || connection.downlink > 0.1
  }

  async getPendingChanges(): Promise<OfflineChange[]> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHANGES_STORE], 'readonly')
      const store = transaction.objectStore(this.CHANGES_STORE)
      const index = store.index('synced')
      const request = index.getAll(false) // Get all unsynced changes

      request.onsuccess = () => {
        const changes = request.result.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        resolve(changes)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async savePendingChange(change: Omit<OfflineChange, 'id' | 'timestamp' | 'synced'>): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    const offlineChange: OfflineChange = {
      ...change,
      id: this.generateChangeId(),
      timestamp: new Date().toISOString(),
      synced: false,
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHANGES_STORE], 'readwrite')
      const store = transaction.objectStore(this.CHANGES_STORE)
      const request = store.add(offlineChange)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async markChangeSynced(changeId: string): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHANGES_STORE], 'readwrite')
      const store = transaction.objectStore(this.CHANGES_STORE)
      const getRequest = store.get(changeId)

      getRequest.onsuccess = () => {
        const change = getRequest.result
        if (change) {
          change.synced = true
          const putRequest = store.put(change)
          putRequest.onsuccess = () => resolve()
          putRequest.onerror = () => reject(putRequest.error)
        } else {
          resolve() // Change doesn't exist, consider it synced
        }
      }
      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  async clearPendingChanges(): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHANGES_STORE], 'readwrite')
      const store = transaction.objectStore(this.CHANGES_STORE)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getStorageUsage(): Promise<StorageUsage> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        const used = (estimate.usage || 0) / (1024 * 1024) // Convert to MB
        const available = (estimate.quota || 0) / (1024 * 1024) // Convert to MB
        const percentage = available > 0 ? Math.round((used / available) * 100) : 0

        return { used: Math.round(used * 100) / 100, available: Math.round(available * 100) / 100, percentage }
      } catch (error) {
        console.warn('Storage estimate not available:', error)
      }
    }

    // Fallback estimation
    return { used: 5, available: 50, percentage: 10 }
  }

  async cleanupStorage(): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    // Clean up synced changes older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHANGES_STORE], 'readwrite')
      const store = transaction.objectStore(this.CHANGES_STORE)
      const index = store.index('timestamp')
      const range = IDBKeyRange.upperBound(sevenDaysAgo)
      const request = index.openCursor(range)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          const change = cursor.value
          if (change.synced) {
            cursor.delete()
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  async cacheData(key: string, data: any, expiryMinutes = 60): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    const cacheItem = {
      key,
      data,
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CACHE_STORE], 'readwrite')
      const store = transaction.objectStore(this.CACHE_STORE)
      const request = store.put(cacheItem)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getCachedData<T>(key: string): Promise<T | null> {
    if (!this.db) {
      await this.initializeDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CACHE_STORE], 'readonly')
      const store = transaction.objectStore(this.CACHE_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result
        if (result && new Date(result.expiry) > new Date()) {
          resolve(result.data)
        } else {
          if (result) {
            // Clean up expired item
            const deleteTransaction = this.db!.transaction([this.CACHE_STORE], 'readwrite')
            const deleteStore = deleteTransaction.objectStore(this.CACHE_STORE)
            deleteStore.delete(key)
          }
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  async clearExpiredCache(): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }

    const now = new Date().toISOString()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CACHE_STORE], 'readwrite')
      const store = transaction.objectStore(this.CACHE_STORE)
      const index = store.index('expiry')
      const range = IDBKeyRange.upperBound(now)
      const request = index.openCursor(range)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  private generateChangeId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Network condition assessment
  getConnectionQuality(): 'good' | 'fair' | 'slow' | 'offline' {
    if (!navigator.onLine) {
      return 'offline'
    }

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    
    if (!connection) {
      return 'good' // Default assumption
    }

    const { effectiveType, downlink, rtt } = connection

    if (effectiveType === 'slow-2g' || downlink < 0.5 || rtt > 2000) {
      return 'slow'
    }

    if (effectiveType === '2g' || downlink < 1.5 || rtt > 1000) {
      return 'fair'
    }

    return 'good'
  }

  shouldUseOfflineMode(): boolean {
    const quality = this.getConnectionQuality()
    return quality === 'offline' || quality === 'slow'
  }

  // Delegate queue operations to QueueService
  async getQueue(): Promise<any[]> {
    const { QueueService } = await import('./queue.service')
    return QueueService.getQueue()
  }

  async addToQueue(item: any): Promise<void> {
    const { QueueService } = await import('./queue.service')
    return QueueService.addToQueue(item)
  }

  async updateQueueItem(id: string, updates: any): Promise<void> {
    const { QueueService } = await import('./queue.service')
    return QueueService.updateQueueItem(id, updates)
  }

  async removeFromQueue(id: string): Promise<void> {
    const { QueueService } = await import('./queue.service')
    return QueueService.removeFromQueue(id)
  }

  async clearQueue(): Promise<void> {
    const { QueueService } = await import('./queue.service')
    return QueueService.clearQueue()
  }

  async processQueue(): Promise<void> {
    const { QueueService } = await import('./queue.service')
    return QueueService.processQueue()
  }

  async getQueueStats(): Promise<any> {
    const { QueueService } = await import('./queue.service')
    return QueueService.getQueueStats()
  }

  async exportQueue(): Promise<any> {
    const { QueueService } = await import('./queue.service')
    return QueueService.exportQueue()
  }

  async importQueue(items: any[]): Promise<void> {
    const { QueueService } = await import('./queue.service')
    return QueueService.importQueue(items)
  }

  async compressQueue(): Promise<void> {
    const { QueueService } = await import('./queue.service')
    return QueueService.compressQueue()
  }
}

export const OfflineService = new OfflineServiceClass()