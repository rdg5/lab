import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SyncStatus } from '../SyncStatus'
import { render, createMockSyncStatus, MockWebSocket, MockEventSource } from '../../test/utils/test-utils'

// Mock WebSocket and EventSource
global.WebSocket = MockWebSocket as any
global.EventSource = MockEventSource as any

// Mock sync service
vi.mock('../../services/sync.service', () => ({
  SyncService: {
    getStatus: vi.fn(),
    forcSync: vi.fn(),
    pauseSync: vi.fn(),
    resumeSync: vi.fn(),
    retryFailedSync: vi.fn(),
    clearConflicts: vi.fn(),
  },
}))

describe('SyncStatus Component', () => {
  const defaultProps = {
    syncStatus: createMockSyncStatus(),
    onForceSync: vi.fn(),
    onRetry: vi.fn(),
    onResolveConflict: vi.fn(),
    showDetails: true,
    compact: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
    })
  })

  describe('Basic Rendering', () => {
    it('should show online status when connected and synced', () => {
      render(<SyncStatus {...defaultProps} />)

      expect(screen.getByTestId('sync-indicator')).toHaveClass('status-synced')
      expect(screen.getByText('Synced')).toBeInTheDocument()
      expect(screen.getByTestId('online-indicator')).toHaveClass('online')
    })

    it('should show offline status when disconnected', () => {
      Object.defineProperty(navigator, 'onLine', { value: false })
      const offlineStatus = createMockSyncStatus({
        isOnline: false,
        syncInProgress: false,
      })

      render(<SyncStatus {...defaultProps} syncStatus={offlineStatus} />)

      expect(screen.getByTestId('sync-indicator')).toHaveClass('status-offline')
      expect(screen.getByText('Offline')).toBeInTheDocument()
      expect(screen.getByTestId('online-indicator')).toHaveClass('offline')
    })

    it('should show syncing status when sync in progress', () => {
      const syncingStatus = createMockSyncStatus({
        syncInProgress: true,
        pendingChanges: 3,
      })

      render(<SyncStatus {...defaultProps} syncStatus={syncingStatus} />)

      expect(screen.getByTestId('sync-indicator')).toHaveClass('status-syncing')
      expect(screen.getByText('Syncing...')).toBeInTheDocument()
      expect(screen.getByTestId('sync-spinner')).toBeInTheDocument()
    })

    it('should show pending changes count', () => {
      const pendingStatus = createMockSyncStatus({
        pendingChanges: 5,
      })

      render(<SyncStatus {...defaultProps} syncStatus={pendingStatus} />)

      expect(screen.getByText('5 changes pending')).toBeInTheDocument()
    })

    it('should show error status', () => {
      const errorStatus = createMockSyncStatus({
        error: 'Network connection failed',
      })

      render(<SyncStatus {...defaultProps} syncStatus={errorStatus} />)

      expect(screen.getByTestId('sync-indicator')).toHaveClass('status-error')
      expect(screen.getByText('Sync Error')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Network connection failed')
    })

    it('should show last sync time', () => {
      const status = createMockSyncStatus({
        lastSync: '2024-01-01T12:00:00Z',
      })

      render(<SyncStatus {...defaultProps} syncStatus={status} />)

      expect(screen.getByText(/Last sync:/)).toBeInTheDocument()
      expect(screen.getByText(/Jan 1, 2024/)).toBeInTheDocument()
    })

    it('should render compact mode', () => {
      render(<SyncStatus {...defaultProps} compact={true} />)

      expect(screen.getByTestId('sync-status')).toHaveClass('compact')
      expect(screen.queryByText('Synced')).not.toBeInTheDocument()
      expect(screen.getByTestId('sync-indicator')).toBeInTheDocument()
    })

    it('should hide details when showDetails is false', () => {
      render(<SyncStatus {...defaultProps} showDetails={false} />)

      expect(screen.queryByText(/Last sync:/)).not.toBeInTheDocument()
      expect(screen.queryByText('changes pending')).not.toBeInTheDocument()
    })
  })

  describe('Connection Status Monitoring', () => {
    it('should detect online/offline changes', async () => {
      render(<SyncStatus {...defaultProps} />)

      expect(screen.getByTestId('online-indicator')).toHaveClass('online')

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', { value: false })
      window.dispatchEvent(new Event('offline'))

      await waitFor(() => {
        expect(screen.getByTestId('online-indicator')).toHaveClass('offline')
      })

      // Simulate coming back online
      Object.defineProperty(navigator, 'onLine', { value: true })
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(screen.getByTestId('online-indicator')).toHaveClass('online')
      })
    })

    it('should show connection quality indicator', () => {
      const slowConnectionStatus = createMockSyncStatus({
        connectionQuality: 'slow',
      })

      render(<SyncStatus {...defaultProps} syncStatus={slowConnectionStatus} />)

      expect(screen.getByTestId('connection-quality')).toHaveClass('quality-slow')
      expect(screen.getByText('Slow connection')).toBeInTheDocument()
    })

    it('should display estimated time to sync', () => {
      const pendingStatus = createMockSyncStatus({
        pendingChanges: 10,
        estimatedSyncTime: 30, // seconds
      })

      render(<SyncStatus {...defaultProps} syncStatus={pendingStatus} />)

      expect(screen.getByText('~30s to sync')).toBeInTheDocument()
    })

    it('should handle connection timeout', async () => {
      const timeoutStatus = createMockSyncStatus({
        error: 'Connection timeout',
        isOnline: false,
      })

      render(<SyncStatus {...defaultProps} syncStatus={timeoutStatus} />)

      expect(screen.getByText('Connection lost')).toBeInTheDocument()
      expect(screen.getByText('Retrying...')).toBeInTheDocument()
    })
  })

  describe('Sync Progress', () => {
    it('should show progress bar during sync', () => {
      const syncingStatus = createMockSyncStatus({
        syncInProgress: true,
        syncProgress: 0.7, // 70%
      })

      render(<SyncStatus {...defaultProps} syncStatus={syncingStatus} />)

      const progressBar = screen.getByTestId('sync-progress-bar')
      expect(progressBar).toHaveStyle('width: 70%')
      expect(screen.getByText('70%')).toBeInTheDocument()
    })

    it('should show items being synced', () => {
      const syncingStatus = createMockSyncStatus({
        syncInProgress: true,
        currentSyncItem: 'Todo: Buy groceries',
      })

      render(<SyncStatus {...defaultProps} syncStatus={syncingStatus} />)

      expect(screen.getByText('Syncing: Todo: Buy groceries')).toBeInTheDocument()
    })

    it('should show sync queue information', () => {
      const queueStatus = createMockSyncStatus({
        syncQueue: [
          { id: '1', type: 'todo', action: 'create' },
          { id: '2', type: 'todo', action: 'update' },
          { id: '3', type: 'subtask', action: 'delete' },
        ],
      })

      render(<SyncStatus {...defaultProps} syncStatus={queueStatus} />)

      expect(screen.getByText('3 items in queue')).toBeInTheDocument()
      expect(screen.getByText('2 todos, 1 subtask')).toBeInTheDocument()
    })

    it('should show pause/resume controls during sync', async () => {
      const user = userEvent.setup()
      const syncingStatus = createMockSyncStatus({
        syncInProgress: true,
      })

      render(<SyncStatus {...defaultProps} syncStatus={syncingStatus} />)

      const pauseButton = screen.getByLabelText('Pause sync')
      expect(pauseButton).toBeInTheDocument()

      await user.click(pauseButton)

      // Should show resume button after pause
      expect(screen.getByLabelText('Resume sync')).toBeInTheDocument()
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should show retry button for sync errors', async () => {
      const user = userEvent.setup()
      const errorStatus = createMockSyncStatus({
        error: 'Sync failed: Server error',
      })

      render(<SyncStatus {...defaultProps} syncStatus={errorStatus} />)

      const retryButton = screen.getByText('Retry')
      expect(retryButton).toBeInTheDocument()

      await user.click(retryButton)

      expect(defaultProps.onRetry).toHaveBeenCalled()
    })

    it('should show conflict resolution options', async () => {
      const user = userEvent.setup()
      const conflictStatus = createMockSyncStatus({
        conflicts: [
          {
            id: '1',
            type: 'todo',
            local: { title: 'Local version' },
            remote: { title: 'Remote version' },
            field: 'title',
          },
        ],
      })

      render(<SyncStatus {...defaultProps} syncStatus={conflictStatus} />)

      expect(screen.getByText('1 conflict to resolve')).toBeInTheDocument()
      
      const resolveButton = screen.getByText('Resolve Conflicts')
      await user.click(resolveButton)

      expect(defaultProps.onResolveConflict).toHaveBeenCalled()
    })

    it('should categorize different error types', () => {
      const networkErrorStatus = createMockSyncStatus({
        error: 'Network error: Connection refused',
        errorType: 'network',
      })

      render(<SyncStatus {...defaultProps} syncStatus={networkErrorStatus} />)

      expect(screen.getByTestId('error-icon')).toHaveClass('error-network')
      expect(screen.getByText('Check your internet connection')).toBeInTheDocument()
    })

    it('should show server maintenance notice', () => {
      const maintenanceStatus = createMockSyncStatus({
        error: 'Server maintenance in progress',
        errorType: 'maintenance',
      })

      render(<SyncStatus {...defaultProps} syncStatus={maintenanceStatus} />)

      expect(screen.getByText('Maintenance Mode')).toBeInTheDocument()
      expect(screen.getByText('Sync will resume automatically')).toBeInTheDocument()
    })

    it('should handle quota exceeded errors', () => {
      const quotaStatus = createMockSyncStatus({
        error: 'Storage quota exceeded',
        errorType: 'quota',
      })

      render(<SyncStatus {...defaultProps} syncStatus={quotaStatus} />)

      expect(screen.getByText('Storage Full')).toBeInTheDocument()
      expect(screen.getByText('Manage Storage')).toBeInTheDocument()
    })
  })

  describe('Force Sync and Manual Controls', () => {
    it('should trigger force sync when refresh button is clicked', async () => {
      const user = userEvent.setup()
      
      render(<SyncStatus {...defaultProps} />)

      const refreshButton = screen.getByLabelText('Force sync')
      await user.click(refreshButton)

      expect(defaultProps.onForceSync).toHaveBeenCalled()
    })

    it('should disable force sync during active sync', () => {
      const syncingStatus = createMockSyncStatus({
        syncInProgress: true,
      })

      render(<SyncStatus {...defaultProps} syncStatus={syncingStatus} />)

      const refreshButton = screen.getByLabelText('Force sync')
      expect(refreshButton).toBeDisabled()
    })

    it('should show cooldown period after force sync', async () => {
      const user = userEvent.setup()
      const cooldownStatus = createMockSyncStatus({
        forceSyncCooldown: 5, // 5 seconds
      })

      render(<SyncStatus {...defaultProps} syncStatus={cooldownStatus} />)

      const refreshButton = screen.getByLabelText('Force sync')
      expect(refreshButton).toBeDisabled()
      expect(screen.getByText('Wait 5s')).toBeInTheDocument()
    })

    it('should show sync settings menu', async () => {
      const user = userEvent.setup()
      
      render(<SyncStatus {...defaultProps} />)

      const settingsButton = screen.getByLabelText('Sync settings')
      await user.click(settingsButton)

      expect(screen.getByText('Sync Settings')).toBeInTheDocument()
      expect(screen.getByText('Auto-sync')).toBeInTheDocument()
      expect(screen.getByText('Sync interval')).toBeInTheDocument()
    })
  })

  describe('Real-time Updates', () => {
    it('should handle WebSocket connection status', async () => {
      const websocketStatus = createMockSyncStatus({
        websocketConnected: true,
      })

      render(<SyncStatus {...defaultProps} syncStatus={websocketStatus} />)

      expect(screen.getByTestId('realtime-indicator')).toHaveClass('connected')
      expect(screen.getByText('Real-time updates active')).toBeInTheDocument()
    })

    it('should show WebSocket reconnection attempts', async () => {
      const reconnectingStatus = createMockSyncStatus({
        websocketConnected: false,
        websocketReconnecting: true,
        reconnectAttempts: 3,
      })

      render(<SyncStatus {...defaultProps} syncStatus={reconnectingStatus} />)

      expect(screen.getByText('Reconnecting... (attempt 3)')).toBeInTheDocument()
    })

    it('should handle Server-Sent Events fallback', () => {
      const sseStatus = createMockSyncStatus({
        websocketConnected: false,
        sseConnected: true,
      })

      render(<SyncStatus {...defaultProps} syncStatus={sseStatus} />)

      expect(screen.getByText('Updates via SSE')).toBeInTheDocument()
    })

    it('should show polling fallback when real-time is unavailable', () => {
      const pollingStatus = createMockSyncStatus({
        websocketConnected: false,
        sseConnected: false,
        pollingActive: true,
        pollingInterval: 30, // 30 seconds
      })

      render(<SyncStatus {...defaultProps} syncStatus={pollingStatus} />)

      expect(screen.getByText('Polling every 30s')).toBeInTheDocument()
    })
  })

  describe('Offline Mode', () => {
    it('should show offline mode indicator', () => {
      const offlineStatus = createMockSyncStatus({
        isOnline: false,
        offlineMode: true,
      })

      render(<SyncStatus {...defaultProps} syncStatus={offlineStatus} />)

      expect(screen.getByText('Working Offline')).toBeInTheDocument()
      expect(screen.getByTestId('offline-mode-badge')).toBeInTheDocument()
    })

    it('should show offline storage usage', () => {
      const offlineStatus = createMockSyncStatus({
        isOnline: false,
        offlineStorageUsed: 5.2, // MB
        offlineStorageLimit: 10, // MB
      })

      render(<SyncStatus {...defaultProps} syncStatus={offlineStatus} />)

      expect(screen.getByText('Offline storage: 5.2/10 MB')).toBeInTheDocument()
    })

    it('should warn when offline storage is nearly full', () => {
      const nearFullStatus = createMockSyncStatus({
        isOnline: false,
        offlineStorageUsed: 9.5, // MB
        offlineStorageLimit: 10, // MB
      })

      render(<SyncStatus {...defaultProps} syncStatus={nearFullStatus} />)

      expect(screen.getByText('Offline storage nearly full')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('should show data that will be synced when online', () => {
      const offlineStatus = createMockSyncStatus({
        isOnline: false,
        pendingChanges: 8,
        offlineChangeSummary: {
          created: 3,
          updated: 4,
          deleted: 1,
        },
      })

      render(<SyncStatus {...defaultProps} syncStatus={offlineStatus} />)

      expect(screen.getByText('3 created, 4 updated, 1 deleted')).toBeInTheDocument()
    })
  })

  describe('Data Usage and Optimization', () => {
    it('should show data usage statistics', () => {
      const dataStatus = createMockSyncStatus({
        dataUsage: {
          thisSession: 1.5, // MB
          today: 12.3, // MB
          thisMonth: 450.7, // MB
        },
      })

      render(<SyncStatus {...defaultProps} syncStatus={dataStatus} />)

      expect(screen.getByText('Data used: 1.5 MB this session')).toBeInTheDocument()
      expect(screen.getByText('12.3 MB today')).toBeInTheDocument()
    })

    it('should show low data mode indicator', () => {
      const lowDataStatus = createMockSyncStatus({
        lowDataMode: true,
      })

      render(<SyncStatus {...defaultProps} syncStatus={lowDataStatus} />)

      expect(screen.getByText('Low Data Mode')).toBeInTheDocument()
      expect(screen.getByTestId('low-data-indicator')).toBeInTheDocument()
    })

    it('should show compression status', () => {
      const compressionStatus = createMockSyncStatus({
        compression: {
          enabled: true,
          ratio: 0.3, // 70% compression
        },
      })

      render(<SyncStatus {...defaultProps} syncStatus={compressionStatus} />)

      expect(screen.getByText('Compression: 70%')).toBeInTheDocument()
    })
  })

  describe('User Interface States', () => {
    it('should show tooltip on hover', async () => {
      const user = userEvent.setup()
      
      render(<SyncStatus {...defaultProps} />)

      const indicator = screen.getByTestId('sync-indicator')
      await user.hover(indicator)

      expect(screen.getByRole('tooltip')).toHaveTextContent('All changes synced')
    })

    it('should expand details on click', async () => {
      const user = userEvent.setup()
      
      render(<SyncStatus {...defaultProps} />)

      const indicator = screen.getByTestId('sync-indicator')
      await user.click(indicator)

      expect(screen.getByTestId('sync-details-expanded')).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      
      render(<SyncStatus {...defaultProps} />)

      const indicator = screen.getByTestId('sync-indicator')
      indicator.focus()

      await user.keyboard('{Enter}')

      expect(screen.getByTestId('sync-details-expanded')).toBeInTheDocument()
    })

    it('should animate status changes', async () => {
      const { rerender } = render(<SyncStatus {...defaultProps} />)

      const syncingStatus = createMockSyncStatus({
        syncInProgress: true,
      })

      rerender(<SyncStatus {...defaultProps} syncStatus={syncingStatus} />)

      expect(screen.getByTestId('sync-indicator')).toHaveClass('status-changing')
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SyncStatus {...defaultProps} />)

      expect(screen.getByTestId('sync-status')).toHaveAccessibleName('Sync status')
      expect(screen.getByTestId('sync-indicator')).toHaveAccessibleDescription('All changes synced')
    })

    it('should announce status changes to screen readers', async () => {
      const { rerender } = render(<SyncStatus {...defaultProps} />)

      const errorStatus = createMockSyncStatus({
        error: 'Sync failed',
      })

      rerender(<SyncStatus {...defaultProps} syncStatus={errorStatus} />)

      expect(screen.getByRole('status')).toHaveTextContent('Sync error occurred')
    })

    it('should provide keyboard shortcuts', async () => {
      const user = userEvent.setup()
      
      render(<SyncStatus {...defaultProps} />)

      // Ctrl+Shift+S should force sync
      await user.keyboard('{Control>}{Shift>}s{/Shift}{/Control}')

      expect(defaultProps.onForceSync).toHaveBeenCalled()
    })

    it('should support high contrast mode', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-contrast: high)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      render(<SyncStatus {...defaultProps} />)

      expect(screen.getByTestId('sync-status')).toHaveClass('high-contrast')
    })
  })

  describe('Performance', () => {
    it('should throttle status updates', async () => {
      const updateSpy = vi.fn()
      
      render(<SyncStatus {...defaultProps} onStatusUpdate={updateSpy} />)

      // Simulate rapid status changes
      for (let i = 0; i < 10; i++) {
        window.dispatchEvent(new CustomEvent('syncStatusUpdate', {
          detail: { pendingChanges: i }
        }))
      }

      // Should throttle updates
      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledTimes(1)
      })
    })

    it('should memoize expensive calculations', () => {
      const calculationSpy = vi.fn(() => ({ progress: 0.5 }))
      
      const { rerender } = render(
        <SyncStatus 
          {...defaultProps} 
          calculateProgress={calculationSpy}
        />
      )

      expect(calculationSpy).toHaveBeenCalledTimes(1)

      // Re-render with same props
      rerender(<SyncStatus {...defaultProps} calculateProgress={calculationSpy} />)

      // Should be memoized
      expect(calculationSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error Recovery', () => {
    it('should automatically retry after network recovery', async () => {
      const { rerender } = render(<SyncStatus {...defaultProps} />)

      // Go offline
      Object.defineProperty(navigator, 'onLine', { value: false })
      window.dispatchEvent(new Event('offline'))

      const offlineStatus = createMockSyncStatus({
        isOnline: false,
        error: 'Network unavailable',
      })

      rerender(<SyncStatus {...defaultProps} syncStatus={offlineStatus} />)

      // Come back online
      Object.defineProperty(navigator, 'onLine', { value: true })
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(defaultProps.onRetry).toHaveBeenCalled()
      })
    })

    it('should implement exponential backoff for retries', () => {
      const retryStatus = createMockSyncStatus({
        error: 'Temporary server error',
        retryAttempts: 3,
        nextRetryIn: 8, // 8 seconds (exponential backoff)
      })

      render(<SyncStatus {...defaultProps} syncStatus={retryStatus} />)

      expect(screen.getByText('Retrying in 8s (attempt 3)')).toBeInTheDocument()
    })

    it('should show manual intervention required for persistent errors', () => {
      const persistentErrorStatus = createMockSyncStatus({
        error: 'Authentication expired',
        retryAttempts: 5,
        requiresManualIntervention: true,
      })

      render(<SyncStatus {...defaultProps} syncStatus={persistentErrorStatus} />)

      expect(screen.getByText('Manual action required')).toBeInTheDocument()
      expect(screen.getByText('Re-authenticate')).toBeInTheDocument()
    })
  })
})