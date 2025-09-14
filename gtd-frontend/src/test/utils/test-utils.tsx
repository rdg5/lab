import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

// Mock GTD types
export interface GTDTodo {
  id: string
  title: string
  description?: string
  outcome?: string // GTD: What success looks like
  nextAction?: string // GTD: The very next physical action
  context?: string[] // GTD: Where/how this can be done (@calls, @computer, etc.)
  project?: string // GTD: Associated project
  status: 'inbox' | 'next' | 'waiting' | 'someday' | 'completed' | 'reference'
  priority: 'low' | 'medium' | 'high'
  dueDate?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  subtasks?: GTDSubtask[]
  tags?: string[]
  estimatedMinutes?: number
  actualMinutes?: number
  energy: 'low' | 'medium' | 'high' // GTD: Energy level required
  llmTransformations?: LLMTransformation[]
  syncStatus: 'synced' | 'pending' | 'error'
  offlineChanges?: OfflineChange[]
}

export interface GTDSubtask {
  id: string
  todoId: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface LLMTransformation {
  id: string
  todoId: string
  type: 'clarify' | 'break_down' | 'optimize' | 'suggest_context'
  input: string
  output: string
  timestamp: string
  model: string
  confidence: number
}

export interface OfflineChange {
  id: string
  todoId: string
  action: 'create' | 'update' | 'delete'
  data: Partial<GTDTodo>
  timestamp: string
  synced: boolean
}

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar?: string
  provider: 'google' | 'github' | 'microsoft'
}

export interface SyncStatus {
  isOnline: boolean
  lastSync: string | null
  pendingChanges: number
  syncInProgress: boolean
  error: string | null
}

// Test data factories
export const createMockTodo = (overrides: Partial<GTDTodo> = {}): GTDTodo => ({
  id: '1',
  title: 'Test Todo',
  description: 'Test description',
  outcome: 'Successfully complete the test',
  nextAction: 'Write the test code',
  context: ['@computer'],
  project: 'Test Project',
  status: 'inbox',
  priority: 'medium',
  dueDate: '2024-01-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  tags: ['work', 'urgent'],
  estimatedMinutes: 30,
  energy: 'medium',
  syncStatus: 'synced',
  subtasks: [],
  llmTransformations: [],
  offlineChanges: [],
  ...overrides,
})

export const createMockSubtask = (overrides: Partial<GTDSubtask> = {}): GTDSubtask => ({
  id: '1',
  todoId: '1',
  title: 'Test Subtask',
  completed: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
})

export const createMockUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  provider: 'google',
  ...overrides,
})

export const createMockSyncStatus = (overrides: Partial<SyncStatus> = {}): SyncStatus => ({
  isOnline: true,
  lastSync: '2024-01-01T00:00:00Z',
  pendingChanges: 0,
  syncInProgress: false,
  error: null,
  ...overrides,
})

// Custom render function
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }

// Mock WebSocket for testing
export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen?: ((event: Event) => void) | null = null
  onclose?: ((event: CloseEvent) => void) | null = null
  onmessage?: ((event: MessageEvent) => void) | null = null
  onerror?: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 0)
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  // Helper method to simulate receiving messages
  simulateMessage(data: any) {
    if (this.readyState === MockWebSocket.OPEN) {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }
}

// Mock Server-Sent Events for testing
export class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  readyState = MockEventSource.CONNECTING
  url: string
  onopen?: ((event: Event) => void) | null = null
  onmessage?: ((event: MessageEvent) => void) | null = null
  onerror?: ((event: Event) => void) | null = null

  private eventListeners: { [key: string]: EventListener[] } = {}

  constructor(url: string) {
    this.url = url
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN
      this.onopen?.(new Event('open'))
    }, 0)
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = []
    }
    this.eventListeners[type].push(listener)
  }

  removeEventListener(type: string, listener: EventListener) {
    if (this.eventListeners[type]) {
      this.eventListeners[type] = this.eventListeners[type].filter(l => l !== listener)
    }
  }

  close() {
    this.readyState = MockEventSource.CLOSED
  }

  // Helper method to simulate receiving events
  simulateEvent(type: string, data: any) {
    if (this.readyState === MockEventSource.OPEN) {
      const event = new MessageEvent(type, { data: JSON.stringify(data) })
      this.eventListeners[type]?.forEach(listener => listener(event))
      if (type === 'message') {
        this.onmessage?.(event)
      }
    }
  }
}

// Utility functions for testing
export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0))

export const mockLocalStorage = () => {
  const storage: { [key: string]: string } = {}
  
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => {
        storage[key] = value
      },
      removeItem: (key: string) => {
        delete storage[key]
      },
      clear: () => {
        Object.keys(storage).forEach(key => delete storage[key])
      },
    },
    writable: true,
  })
  
  return storage
}

export const mockMatchMedia = () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// Mock intersection observer for testing
export const mockIntersectionObserver = () => {
  const mockIntersectionObserver = vi.fn()
  mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null,
  })
  window.IntersectionObserver = mockIntersectionObserver
  window.IntersectionObserverEntry = {} as any
  window.IntersectionObserverInit = {} as any
}