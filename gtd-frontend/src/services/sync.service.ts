import { SyncStatus } from '../test/utils/test-utils'

export interface SyncQueueItem {
  id: string
  type: string
  action: 'create' | 'update' | 'delete'
  data: any
  timestamp: string
  retryCount?: number
}

export interface SyncHistoryItem {
  id: string
  timestamp: string
  type: 'manual' | 'automatic'
  status: 'completed' | 'failed' | 'cancelled'
  itemsSync: number
  duration: number
  error?: string
}

export interface SyncStatistics {
  totalSyncs: number
  successRate: number
  averageDuration: number
  dataTransferred: number
}

class SyncServiceClass {
  private readonly API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3000/api'

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('auth_token')
    const url = `${this.API_BASE_URL}${endpoint}`
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = new Error(errorData.message || `Sync request failed: ${response.statusText}`)
      
      // Add error types for different scenarios
      if (response.status >= 500) {
        error.name = 'ServerError'
      } else if (response.status === 0 || !navigator.onLine) {
        error.name = 'NetworkError'
      } else if (response.status === 409) {
        error.name = 'ConflictError'
      } else if (response.status === 413) {
        error.name = 'PayloadTooLargeError'
      }
      
      throw error
    }

    return response.json()
  }

  async getStatus(): Promise<SyncStatus> {
    return this.request<SyncStatus>('/sync/status')
  }

  async startSync(): Promise<void> {
    await this.request('/sync/start', { method: 'POST' })
  }

  async pauseSync(): Promise<void> {
    await this.request('/sync/pause', { method: 'POST' })
  }

  async resumeSync(): Promise<void> {
    await this.request('/sync/resume', { method: 'POST' })
  }

  async forceSync(): Promise<void> {
    await this.request('/sync/force', { method: 'POST' })
  }

  async retrySync(): Promise<void> {
    await this.request('/sync/retry', { method: 'POST' })
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return this.request<SyncQueueItem[]>('/sync/queue')
  }

  async addToQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp'>): Promise<void> {
    await this.request('/sync/queue', {
      method: 'POST',
      body: JSON.stringify({
        ...item,
        timestamp: new Date().toISOString(),
      }),
    })
  }

  async removeFromQueue(itemId: string): Promise<void> {
    await this.request(`/sync/queue/${itemId}`, { method: 'DELETE' })
  }

  async clearQueue(): Promise<void> {
    await this.request('/sync/queue/clear', { method: 'DELETE' })
  }

  async getSyncHistory(limit?: number): Promise<SyncHistoryItem[]> {
    const params = limit ? `?limit=${limit}` : ''
    return this.request<SyncHistoryItem[]>(`/sync/history${params}`)
  }

  async getSyncStatistics(): Promise<SyncStatistics> {
    return this.request<SyncStatistics>('/sync/statistics')
  }

  // Utility methods for client-side operations
  generateSyncId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  calculateSyncPriority(item: SyncQueueItem): number {
    // Higher priority for more recent items and certain operations
    const age = Date.now() - new Date(item.timestamp).getTime()
    const ageScore = Math.max(0, 100 - (age / 1000 / 60)) // Decreases over time
    
    const actionScore = {
      delete: 30,
      update: 20,
      create: 10,
    }[item.action] || 10

    return ageScore + actionScore
  }

  shouldRetryOperation(error: Error, retryCount: number): boolean {
    const maxRetries = 3
    
    if (retryCount >= maxRetries) {
      return false
    }

    // Don't retry on client errors (4xx)
    if (error.name === 'ConflictError' || error.message.includes('400')) {
      return false
    }

    // Retry on network and server errors
    return error.name === 'NetworkError' || error.name === 'ServerError'
  }

  calculateRetryDelay(retryCount: number, exponentialBackoff = true): number {
    if (!exponentialBackoff) {
      return 1000 // Fixed 1 second delay
    }

    // Exponential backoff: 1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, retryCount), 30000) // Max 30 seconds
  }
}

export const SyncService = new SyncServiceClass()