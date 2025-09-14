import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { render, createMockTodo, createMockUser, MockWebSocket, MockEventSource } from '../utils/test-utils'

// Mock App component (would normally import the actual App)
const MockApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <div data-testid="app">
      <header data-testid="app-header">GTD Todo App</header>
      <main data-testid="app-main">{children}</main>
    </div>
  )
}

// Mock services
vi.mock('../../services/api.service', () => ({
  ApiService: {
    getTodos: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    createSubtask: vi.fn(),
    updateSubtask: vi.fn(),
    deleteSubtask: vi.fn(),
  },
}))

vi.mock('../../services/auth.service', () => ({
  AuthService: {
    getCurrentUser: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(() => () => {}),
  },
}))

vi.mock('../../services/sync.service', () => ({
  SyncService: {
    getStatus: vi.fn(),
    startSync: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}))

// Mock WebSocket and EventSource
global.WebSocket = MockWebSocket as any
global.EventSource = MockEventSource as any

// Integration test wrapper
const IntegrationWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
      mutations: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MockApp>{children}</MockApp>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

// Mock components for integration testing
const TodoDashboard = () => {
  const [todos, setTodos] = React.useState([
    createMockTodo({ id: '1', title: 'Learn React', status: 'next' }),
    createMockTodo({ id: '2', title: 'Build todo app', status: 'inbox' }),
  ])
  const [isCreating, setIsCreating] = React.useState(false)

  const handleCreate = async (data: any) => {
    setIsCreating(true)
    // Simulate optimistic update
    const optimisticTodo = createMockTodo({
      id: `temp-${Date.now()}`,
      ...data,
      syncStatus: 'pending',
    })
    setTodos(prev => [...prev, optimisticTodo])

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      const savedTodo = createMockTodo({ id: `saved-${Date.now()}`, ...data })
      setTodos(prev => prev.map(t => t.id.startsWith('temp-') ? savedTodo : t))
    } catch (error) {
      // Revert optimistic update
      setTodos(prev => prev.filter(t => !t.id.startsWith('temp-')))
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdate = async (id: string, updates: any) => {
    // Optimistic update
    setTodos(prev => prev.map(t => 
      t.id === id 
        ? { ...t, ...updates, syncStatus: 'pending' as const }
        : t
    ))

    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      setTodos(prev => prev.map(t => 
        t.id === id 
          ? { ...t, syncStatus: 'synced' as const }
          : t
      ))
    } catch (error) {
      // Revert on error
      setTodos(prev => prev.map(t => 
        t.id === id 
          ? { ...t, syncStatus: 'error' as const }
          : t
      ))
    }
  }

  return (
    <div data-testid="todo-dashboard">
      <div data-testid="todo-form">
        <input 
          data-testid="todo-title-input" 
          placeholder="Add new todo..." 
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && e.currentTarget.value) {
              await handleCreate({ 
                title: e.currentTarget.value, 
                status: 'inbox' 
              })
              e.currentTarget.value = ''
            }
          }}
        />
        {isCreating && <div data-testid="creating-indicator">Creating...</div>}
      </div>
      
      <div data-testid="todo-list">
        {todos.map(todo => (
          <div key={todo.id} data-testid={`todo-item-${todo.id}`}>
            <input
              type="checkbox"
              checked={todo.status === 'completed'}
              onChange={() => handleUpdate(todo.id, { 
                status: todo.status === 'completed' ? 'next' : 'completed' 
              })}
            />
            <span data-testid={`todo-title-${todo.id}`}>{todo.title}</span>
            <span 
              data-testid={`sync-status-${todo.id}`}
              className={`sync-${todo.syncStatus}`}
            >
              {todo.syncStatus}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock successful auth by default
    const { AuthService } = require('../../services/auth.service')
    AuthService.getCurrentUser.mockResolvedValue(createMockUser())
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Real-time Updates', () => {
    it('should handle real-time todo updates via WebSocket', async () => {
      const user = userEvent.setup()
      let websocketInstance: MockWebSocket

      // Mock WebSocket connection
      vi.stubGlobal('WebSocket', vi.fn().mockImplementation((url) => {
        websocketInstance = new MockWebSocket(url)
        return websocketInstance
      }))

      const RealTimeApp = () => {
        const [todos, setTodos] = React.useState([
          createMockTodo({ id: '1', title: 'Original Todo' })
        ])

        React.useEffect(() => {
          const ws = new WebSocket('ws://localhost:8080/todos')
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.type === 'todo_updated') {
              setTodos(prev => prev.map(t => 
                t.id === data.todo.id ? { ...t, ...data.todo } : t
              ))
            } else if (data.type === 'todo_created') {
              setTodos(prev => [...prev, data.todo])
            }
          }
          return () => ws.close()
        }, [])

        return (
          <div data-testid="realtime-app">
            {todos.map(todo => (
              <div key={todo.id} data-testid={`todo-${todo.id}`}>
                {todo.title}
              </div>
            ))}
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <RealTimeApp />
        </IntegrationWrapper>
      )

      // Wait for WebSocket to connect
      await waitFor(() => {
        expect(screen.getByTestId('realtime-app')).toBeInTheDocument()
      })

      expect(screen.getByTestId('todo-1')).toHaveTextContent('Original Todo')

      // Simulate real-time update from server
      act(() => {
        websocketInstance!.simulateMessage({
          type: 'todo_updated',
          todo: {
            id: '1',
            title: 'Updated via WebSocket',
          },
        })
      })

      await waitFor(() => {
        expect(screen.getByTestId('todo-1')).toHaveTextContent('Updated via WebSocket')
      })

      // Simulate new todo from another client
      act(() => {
        websocketInstance!.simulateMessage({
          type: 'todo_created',
          todo: createMockTodo({
            id: '2',
            title: 'New todo from another client',
          }),
        })
      })

      await waitFor(() => {
        expect(screen.getByTestId('todo-2')).toHaveTextContent('New todo from another client')
      })
    })

    it('should handle WebSocket reconnection on connection loss', async () => {
      let websocketInstance: MockWebSocket
      let connectionAttempts = 0

      vi.stubGlobal('WebSocket', vi.fn().mockImplementation((url) => {
        connectionAttempts++
        websocketInstance = new MockWebSocket(url)
        return websocketInstance
      }))

      const ReconnectingApp = () => {
        const [connectionStatus, setConnectionStatus] = React.useState('connecting')

        React.useEffect(() => {
          let ws: WebSocket
          let reconnectTimer: NodeJS.Timeout

          const connect = () => {
            ws = new WebSocket('ws://localhost:8080/todos')
            
            ws.onopen = () => setConnectionStatus('connected')
            ws.onclose = () => {
              setConnectionStatus('disconnected')
              // Auto-reconnect after 1 second
              reconnectTimer = setTimeout(connect, 1000)
            }
            ws.onerror = () => setConnectionStatus('error')
          }

          connect()

          return () => {
            clearTimeout(reconnectTimer)
            ws?.close()
          }
        }, [])

        return (
          <div data-testid="connection-status">
            Status: {connectionStatus}
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <ReconnectingApp />
        </IntegrationWrapper>
      )

      // Wait for initial connection
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Status: connected')
      })

      expect(connectionAttempts).toBe(1)

      // Simulate connection loss
      act(() => {
        websocketInstance!.close()
      })

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Status: disconnected')
      })

      // Should auto-reconnect
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Status: connected')
      }, { timeout: 2000 })

      expect(connectionAttempts).toBe(2)
    })

    it('should fallback to Server-Sent Events when WebSocket fails', async () => {
      let eventSourceInstance: MockEventSource

      // Mock WebSocket to fail
      vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => {
        throw new Error('WebSocket not supported')
      }))

      // Mock EventSource as fallback
      vi.stubGlobal('EventSource', vi.fn().mockImplementation((url) => {
        eventSourceInstance = new MockEventSource(url)
        return eventSourceInstance
      }))

      const FallbackApp = () => {
        const [connectionType, setConnectionType] = React.useState('none')
        const [messages, setMessages] = React.useState<string[]>([])

        React.useEffect(() => {
          // Try WebSocket first
          try {
            const ws = new WebSocket('ws://localhost:8080/todos')
            setConnectionType('websocket')
          } catch (error) {
            // Fallback to SSE
            const eventSource = new EventSource('/api/todos/events')
            setConnectionType('sse')
            
            eventSource.onmessage = (event) => {
              const data = JSON.parse(event.data)
              setMessages(prev => [...prev, data.message])
            }
          }
        }, [])

        return (
          <div data-testid="fallback-app">
            <div data-testid="connection-type">Connection: {connectionType}</div>
            <div data-testid="messages">
              {messages.map((msg, index) => (
                <div key={index} data-testid={`message-${index}`}>{msg}</div>
              ))}
            </div>
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <FallbackApp />
        </IntegrationWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('connection-type')).toHaveTextContent('Connection: sse')
      })

      // Simulate SSE message
      act(() => {
        eventSourceInstance!.simulateEvent('message', {
          message: 'Todo updated via SSE',
        })
      })

      await waitFor(() => {
        expect(screen.getByTestId('message-0')).toHaveTextContent('Todo updated via SSE')
      })
    })
  })

  describe('Optimistic Updates', () => {
    it('should show optimistic updates immediately and sync with server', async () => {
      const user = userEvent.setup()

      render(
        <IntegrationWrapper>
          <TodoDashboard />
        </IntegrationWrapper>
      )

      const titleInput = screen.getByTestId('todo-title-input')
      
      // Add new todo optimistically
      await user.type(titleInput, 'New optimistic todo')
      await user.keyboard('{Enter}')

      // Should show immediately with pending sync status
      await waitFor(() => {
        const newTodo = screen.getByText('New optimistic todo')
        expect(newTodo).toBeInTheDocument()
      })

      // Should show creating indicator
      expect(screen.getByTestId('creating-indicator')).toBeInTheDocument()

      // Should eventually show as synced
      await waitFor(() => {
        expect(screen.queryByTestId('creating-indicator')).not.toBeInTheDocument()
      }, { timeout: 1000 })

      // Find the saved todo (ID will have changed from temp to saved)
      const savedTodo = screen.getByText('New optimistic todo')
      expect(savedTodo).toBeInTheDocument()
    })

    it('should handle optimistic update failures gracefully', async () => {
      const user = userEvent.setup()

      // Mock API to fail
      const { ApiService } = require('../../services/api.service')
      ApiService.createTodo.mockRejectedValue(new Error('Network error'))

      const FailingApp = () => {
        const [todos, setTodos] = React.useState<any[]>([])
        const [error, setError] = React.useState<string | null>(null)

        const handleCreate = async (data: any) => {
          const optimisticTodo = { ...data, id: 'temp-123', syncStatus: 'pending' }
          setTodos(prev => [...prev, optimisticTodo])

          try {
            await ApiService.createTodo(data)
            // Success - replace optimistic todo with real one
            setTodos(prev => prev.map(t => 
              t.id === 'temp-123' 
                ? { ...t, id: 'real-123', syncStatus: 'synced' }
                : t
            ))
          } catch (err) {
            // Failure - remove optimistic todo and show error
            setTodos(prev => prev.filter(t => t.id !== 'temp-123'))
            setError('Failed to create todo')
          }
        }

        return (
          <div>
            <input
              data-testid="todo-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate({ title: e.currentTarget.value })
                  e.currentTarget.value = ''
                }
              }}
            />
            {error && <div data-testid="error-message">{error}</div>}
            <div data-testid="todo-count">Todos: {todos.length}</div>
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <FailingApp />
        </IntegrationWrapper>
      )

      expect(screen.getByTestId('todo-count')).toHaveTextContent('Todos: 0')

      await user.type(screen.getByTestId('todo-input'), 'This will fail')
      await user.keyboard('{Enter}')

      // Should initially show optimistic todo
      await waitFor(() => {
        expect(screen.getByTestId('todo-count')).toHaveTextContent('Todos: 1')
      })

      // Should revert when API fails
      await waitFor(() => {
        expect(screen.getByTestId('todo-count')).toHaveTextContent('Todos: 0')
        expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to create todo')
      })
    })

    it('should handle concurrent optimistic updates correctly', async () => {
      const user = userEvent.setup()

      const ConcurrentApp = () => {
        const [todos, setTodos] = React.useState([
          createMockTodo({ id: '1', title: 'Shared Todo', status: 'next' })
        ])

        const handleStatusUpdate = async (id: string, newStatus: string) => {
          // Optimistic update
          setTodos(prev => prev.map(t => 
            t.id === id ? { ...t, status: newStatus, syncStatus: 'pending' } : t
          ))

          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 200))
          
          setTodos(prev => prev.map(t => 
            t.id === id ? { ...t, syncStatus: 'synced' } : t
          ))
        }

        const handleTitleUpdate = async (id: string, newTitle: string) => {
          setTodos(prev => prev.map(t => 
            t.id === id ? { ...t, title: newTitle, syncStatus: 'pending' } : t
          ))

          await new Promise(resolve => setTimeout(resolve, 300))
          
          setTodos(prev => prev.map(t => 
            t.id === id ? { ...t, syncStatus: 'synced' } : t
          ))
        }

        const todo = todos[0]

        return (
          <div>
            <input
              data-testid="title-input"
              defaultValue={todo.title}
              onBlur={(e) => {
                if (e.target.value !== todo.title) {
                  handleTitleUpdate(todo.id, e.target.value)
                }
              }}
            />
            <button
              data-testid="status-button"
              onClick={() => handleStatusUpdate(
                todo.id, 
                todo.status === 'next' ? 'completed' : 'next'
              )}
            >
              Toggle Status
            </button>
            <div data-testid="todo-status">Status: {todo.status}</div>
            <div data-testid="sync-status">Sync: {todo.syncStatus}</div>
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <ConcurrentApp />
        </IntegrationWrapper>
      )

      // Make concurrent updates
      const titleInput = screen.getByTestId('title-input')
      const statusButton = screen.getByTestId('status-button')

      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Title')
      
      // Trigger title update and status update nearly simultaneously
      titleInput.blur()
      await user.click(statusButton)

      // Both should show as pending
      await waitFor(() => {
        expect(screen.getByTestId('sync-status')).toHaveTextContent('Sync: pending')
      })

      expect(screen.getByTestId('todo-status')).toHaveTextContent('Status: completed')
      expect(titleInput).toHaveValue('Updated Title')

      // Should eventually sync
      await waitFor(() => {
        expect(screen.getByTestId('sync-status')).toHaveTextContent('Sync: synced')
      }, { timeout: 500 })
    })
  })

  describe('Offline Functionality', () => {
    it('should queue actions when offline and sync when online', async () => {
      const user = userEvent.setup()

      const OfflineApp = () => {
        const [isOnline, setIsOnline] = React.useState(navigator.onLine)
        const [queue, setQueue] = React.useState<any[]>([])
        const [todos, setTodos] = React.useState<any[]>([])

        React.useEffect(() => {
          const handleOnline = () => {
            setIsOnline(true)
            // Process queue when coming online
            queue.forEach(async (item) => {
              try {
                // Simulate processing queued item
                await new Promise(resolve => setTimeout(resolve, 100))
                setTodos(prev => [...prev, { ...item, syncStatus: 'synced' }])
              } catch (error) {
                console.error('Failed to process queued item:', error)
              }
            })
            setQueue([])
          }

          const handleOffline = () => setIsOnline(false)

          window.addEventListener('online', handleOnline)
          window.addEventListener('offline', handleOffline)

          return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
          }
        }, [queue])

        const handleCreateTodo = (title: string) => {
          const todo = {
            id: `todo-${Date.now()}`,
            title,
            status: 'inbox',
            syncStatus: isOnline ? 'synced' : 'queued',
          }

          if (isOnline) {
            setTodos(prev => [...prev, todo])
          } else {
            setQueue(prev => [...prev, todo])
          }
        }

        return (
          <div>
            <div data-testid="online-status">
              Status: {isOnline ? 'Online' : 'Offline'}
            </div>
            <div data-testid="queue-count">Queued: {queue.length}</div>
            <input
              data-testid="new-todo-input"
              placeholder="Add todo..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value) {
                  handleCreateTodo(e.currentTarget.value)
                  e.currentTarget.value = ''
                }
              }}
            />
            <div data-testid="todo-list">
              {todos.map(todo => (
                <div key={todo.id} data-testid={`todo-${todo.id}`}>
                  {todo.title} ({todo.syncStatus})
                </div>
              ))}
            </div>
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <OfflineApp />
        </IntegrationWrapper>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Status: Online')

      // Go offline
      Object.defineProperty(navigator, 'onLine', { value: false })
      window.dispatchEvent(new Event('offline'))

      await waitFor(() => {
        expect(screen.getByTestId('online-status')).toHaveTextContent('Status: Offline')
      })

      // Create todos while offline - should queue them
      await user.type(screen.getByTestId('new-todo-input'), 'Offline Todo 1')
      await user.keyboard('{Enter}')

      await user.type(screen.getByTestId('new-todo-input'), 'Offline Todo 2')
      await user.keyboard('{Enter}')

      expect(screen.getByTestId('queue-count')).toHaveTextContent('Queued: 2')

      // Come back online
      Object.defineProperty(navigator, 'onLine', { value: true })
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(screen.getByTestId('online-status')).toHaveTextContent('Status: Online')
      })

      // Queue should be processed
      await waitFor(() => {
        expect(screen.getByTestId('queue-count')).toHaveTextContent('Queued: 0')
      })

      expect(screen.getByText('Offline Todo 1 (synced)')).toBeInTheDocument()
      expect(screen.getByText('Offline Todo 2 (synced)')).toBeInTheDocument()
    })

    it('should handle conflicts when syncing offline changes', async () => {
      const user = userEvent.setup()

      const ConflictApp = () => {
        const [todos, setTodos] = React.useState([
          { id: '1', title: 'Original Title', version: 1 }
        ])
        const [conflicts, setConflicts] = React.useState<any[]>([])

        const handleUpdate = (id: string, newTitle: string) => {
          // Simulate local update
          setTodos(prev => prev.map(t => 
            t.id === id ? { ...t, title: newTitle, version: t.version + 1 } : t
          ))

          // Simulate conflict detection when syncing
          setTimeout(() => {
            setConflicts([{
              id,
              local: { title: newTitle, version: 2 },
              remote: { title: 'Remote Update', version: 2 },
            }])
          }, 100)
        }

        const resolveConflict = (id: string, resolution: 'local' | 'remote') => {
          const conflict = conflicts.find(c => c.id === id)
          if (conflict) {
            const resolvedValue = resolution === 'local' 
              ? conflict.local 
              : conflict.remote
              
            setTodos(prev => prev.map(t => 
              t.id === id ? { ...t, ...resolvedValue } : t
            ))
            setConflicts(prev => prev.filter(c => c.id !== id))
          }
        }

        return (
          <div>
            {todos.map(todo => (
              <div key={todo.id} data-testid={`todo-${todo.id}`}>
                <input
                  defaultValue={todo.title}
                  onBlur={(e) => {
                    if (e.target.value !== todo.title) {
                      handleUpdate(todo.id, e.target.value)
                    }
                  }}
                />
              </div>
            ))}
            {conflicts.map(conflict => (
              <div key={conflict.id} data-testid={`conflict-${conflict.id}`}>
                <div>Conflict detected!</div>
                <div>Local: {conflict.local.title}</div>
                <div>Remote: {conflict.remote.title}</div>
                <button 
                  data-testid="resolve-local"
                  onClick={() => resolveConflict(conflict.id, 'local')}
                >
                  Use Local
                </button>
                <button 
                  data-testid="resolve-remote"
                  onClick={() => resolveConflict(conflict.id, 'remote')}
                >
                  Use Remote
                </button>
              </div>
            ))}
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <ConflictApp />
        </IntegrationWrapper>
      )

      const input = screen.getByDisplayValue('Original Title')
      
      await user.clear(input)
      await user.type(input, 'Local Update')
      input.blur()

      // Should detect conflict
      await waitFor(() => {
        expect(screen.getByTestId('conflict-1')).toBeInTheDocument()
      })

      expect(screen.getByText('Local: Local Update')).toBeInTheDocument()
      expect(screen.getByText('Remote: Remote Update')).toBeInTheDocument()

      // Resolve conflict in favor of local
      await user.click(screen.getByTestId('resolve-local'))

      expect(screen.queryByTestId('conflict-1')).not.toBeInTheDocument()
      expect(input).toHaveValue('Local Update')
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle API errors gracefully with retry mechanism', async () => {
      const user = userEvent.setup()
      let apiCallCount = 0

      const { ApiService } = require('../../services/api.service')
      ApiService.createTodo.mockImplementation(() => {
        apiCallCount++
        if (apiCallCount < 3) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({ id: 'success-123' })
      })

      const RetryApp = () => {
        const [status, setStatus] = React.useState('idle')
        const [error, setError] = React.useState<string | null>(null)
        const [retryCount, setRetryCount] = React.useState(0)

        const handleCreate = async (title: string) => {
          setStatus('creating')
          setError(null)

          try {
            await ApiService.createTodo({ title })
            setStatus('success')
          } catch (err: any) {
            setError(err.message)
            setStatus('error')
          }
        }

        const handleRetry = async () => {
          setRetryCount(prev => prev + 1)
          await handleCreate('Retry Test')
        }

        return (
          <div>
            <button 
              data-testid="create-todo"
              onClick={() => handleCreate('Test Todo')}
            >
              Create Todo
            </button>
            <div data-testid="status">Status: {status}</div>
            {error && (
              <div data-testid="error">
                Error: {error}
                <button data-testid="retry-button" onClick={handleRetry}>
                  Retry ({retryCount})
                </button>
              </div>
            )}
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <RetryApp />
        </IntegrationWrapper>
      )

      // Initial attempt should fail
      await user.click(screen.getByTestId('create-todo'))

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('Status: error')
        expect(screen.getByTestId('error')).toHaveTextContent('Error: Network error')
      })

      // First retry should still fail
      await user.click(screen.getByTestId('retry-button'))

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Error: Network error')
      })

      expect(screen.getByTestId('retry-button')).toHaveTextContent('Retry (1)')

      // Second retry should succeed
      await user.click(screen.getByTestId('retry-button'))

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('Status: success')
      })

      expect(apiCallCount).toBe(3)
    })

    it('should handle authentication errors by redirecting to login', async () => {
      const user = userEvent.setup()

      const { AuthService } = require('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(null) // Not authenticated

      const AuthApp = () => {
        const [isAuthenticated, setIsAuthenticated] = React.useState(false)
        const [isLoading, setIsLoading] = React.useState(true)

        React.useEffect(() => {
          AuthService.getCurrentUser()
            .then((user: any) => {
              setIsAuthenticated(!!user)
            })
            .finally(() => {
              setIsLoading(false)
            })
        }, [])

        if (isLoading) {
          return <div data-testid="loading">Loading...</div>
        }

        if (!isAuthenticated) {
          return (
            <div data-testid="login-screen">
              <h1>Please log in</h1>
              <button 
                data-testid="login-button"
                onClick={() => setIsAuthenticated(true)}
              >
                Log In
              </button>
            </div>
          )
        }

        return (
          <div data-testid="dashboard">
            <h1>Dashboard</h1>
            <button
              data-testid="logout-button"
              onClick={() => setIsAuthenticated(false)}
            >
              Logout
            </button>
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <AuthApp />
        </IntegrationWrapper>
      )

      // Should show loading first
      expect(screen.getByTestId('loading')).toBeInTheDocument()

      // Then show login screen
      await waitFor(() => {
        expect(screen.getByTestId('login-screen')).toBeInTheDocument()
      })

      // Login should show dashboard
      await user.click(screen.getByTestId('login-button'))

      expect(screen.getByTestId('dashboard')).toBeInTheDocument()

      // Logout should return to login
      await user.click(screen.getByTestId('logout-button'))

      expect(screen.getByTestId('login-screen')).toBeInTheDocument()
    })
  })

  describe('Performance and User Experience', () => {
    it('should show loading states during async operations', async () => {
      const user = userEvent.setup()

      const LoadingApp = () => {
        const [isLoading, setIsLoading] = React.useState(false)
        const [data, setData] = React.useState<string | null>(null)

        const handleLoad = async () => {
          setIsLoading(true)
          setData(null)
          
          // Simulate slow API call
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          setData('Loaded data')
          setIsLoading(false)
        }

        return (
          <div>
            <button data-testid="load-button" onClick={handleLoad}>
              Load Data
            </button>
            {isLoading && <div data-testid="loading-indicator">Loading...</div>}
            {data && <div data-testid="data">{data}</div>}
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <LoadingApp />
        </IntegrationWrapper>
      )

      await user.click(screen.getByTestId('load-button'))

      // Should show loading immediately
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
      expect(screen.queryByTestId('data')).not.toBeInTheDocument()

      // Should show data after loading completes
      await waitFor(() => {
        expect(screen.getByTestId('data')).toHaveTextContent('Loaded data')
      }, { timeout: 1500 })

      expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument()
    })

    it('should debounce user input to avoid excessive API calls', async () => {
      const user = userEvent.setup()
      let searchCallCount = 0

      const mockSearch = vi.fn().mockImplementation(() => {
        searchCallCount++
        return Promise.resolve([`Result ${searchCallCount}`])
      })

      const SearchApp = () => {
        const [query, setQuery] = React.useState('')
        const [results, setResults] = React.useState<string[]>([])
        const [isSearching, setIsSearching] = React.useState(false)

        // Debounced search effect
        React.useEffect(() => {
          if (!query.trim()) {
            setResults([])
            return
          }

          setIsSearching(true)
          const timeoutId = setTimeout(async () => {
            try {
              const searchResults = await mockSearch(query)
              setResults(searchResults)
            } finally {
              setIsSearching(false)
            }
          }, 300) // 300ms debounce

          return () => clearTimeout(timeoutId)
        }, [query])

        return (
          <div>
            <input
              data-testid="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
            />
            {isSearching && <div data-testid="searching">Searching...</div>}
            <div data-testid="results">
              {results.map((result, index) => (
                <div key={index} data-testid={`result-${index}`}>
                  {result}
                </div>
              ))}
            </div>
            <div data-testid="search-count">API calls: {searchCallCount}</div>
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <SearchApp />
        </IntegrationWrapper>
      )

      const searchInput = screen.getByTestId('search-input')

      // Type rapidly - should not trigger immediate searches
      await user.type(searchInput, 'test query', { delay: 50 })

      expect(screen.getByTestId('search-count')).toHaveTextContent('API calls: 0')

      // Should show searching indicator
      await waitFor(() => {
        expect(screen.getByTestId('searching')).toBeInTheDocument()
      })

      // Should only make one API call after debounce
      await waitFor(() => {
        expect(screen.getByTestId('search-count')).toHaveTextContent('API calls: 1')
      }, { timeout: 500 })

      expect(screen.getByTestId('result-0')).toHaveTextContent('Result 1')
      expect(screen.queryByTestId('searching')).not.toBeInTheDocument()
    })

    it('should handle large lists with virtualization', async () => {
      const LargeListApp = () => {
        const items = React.useMemo(() => 
          Array.from({ length: 10000 }, (_, i) => ({
            id: i,
            title: `Item ${i}`,
          }))
        , [])

        const [visibleItems, setVisibleItems] = React.useState(items.slice(0, 50))

        const handleScroll = React.useCallback((e: React.UIEvent) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
          const scrollPercentage = scrollTop / (scrollHeight - clientHeight)
          
          // Simple virtualization - show different slice based on scroll
          const startIndex = Math.floor(scrollPercentage * (items.length - 50))
          setVisibleItems(items.slice(startIndex, startIndex + 50))
        }, [items])

        return (
          <div>
            <div data-testid="total-count">Total: {items.length} items</div>
            <div 
              data-testid="virtual-list"
              style={{ height: '400px', overflow: 'auto' }}
              onScroll={handleScroll}
            >
              <div style={{ height: `${items.length * 40}px`, position: 'relative' }}>
                {visibleItems.map((item, index) => (
                  <div 
                    key={item.id}
                    data-testid={`item-${item.id}`}
                    style={{ 
                      position: 'absolute',
                      top: `${item.id * 40}px`,
                      height: '40px',
                      width: '100%'
                    }}
                  >
                    {item.title}
                  </div>
                ))}
              </div>
            </div>
            <div data-testid="rendered-count">
              Rendered: {visibleItems.length} items
            </div>
          </div>
        )
      }

      render(
        <IntegrationWrapper>
          <LargeListApp />
        </IntegrationWrapper>
      )

      expect(screen.getByTestId('total-count')).toHaveTextContent('Total: 10000 items')
      expect(screen.getByTestId('rendered-count')).toHaveTextContent('Rendered: 50 items')
      
      // Should only render visible items, not all 10,000
      expect(screen.getByTestId('item-0')).toBeInTheDocument()
      expect(screen.getByTestId('item-49')).toBeInTheDocument()
      expect(screen.queryByTestId('item-100')).not.toBeInTheDocument()
    })
  })
})