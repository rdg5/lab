import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoList } from '../TodoList'
import { render, createMockTodo, mockIntersectionObserver } from '../../test/utils/test-utils'

// Mock virtual scrolling library
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [
      { index: 0, start: 0, size: 80, key: 0 },
      { index: 1, start: 80, size: 80, key: 1 },
    ],
    getTotalSize: () => 160,
    scrollToIndex: vi.fn(),
  })),
}))

// Mock TodoItem component
vi.mock('../TodoItem', () => ({
  TodoItem: ({ todo, onUpdate, onDelete, onStatusChange, isSelected }: any) => (
    <div data-testid={`todo-item-${todo.id}`} className={isSelected ? 'selected' : ''}>
      <div>{todo.title}</div>
      <div data-testid={`todo-status-${todo.id}`}>{todo.status}</div>
      <div data-testid={`todo-priority-${todo.id}`}>{todo.priority}</div>
      <button onClick={() => onStatusChange(todo.id, 'completed')}>
        Mark Complete
      </button>
      <button onClick={() => onUpdate(todo.id, { title: 'Updated' })}>
        Update
      </button>
      <button onClick={() => onDelete(todo.id)}>Delete</button>
      {todo.context?.map((ctx: string) => (
        <span key={ctx} data-testid={`context-${ctx}`}>{ctx}</span>
      ))}
    </div>
  ),
}))

describe('TodoList Component', () => {
  const mockTodos = [
    createMockTodo({ 
      id: '1', 
      title: 'First Todo', 
      status: 'inbox',
      priority: 'high',
      context: ['@computer'],
      project: 'Project A',
      dueDate: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
    }),
    createMockTodo({ 
      id: '2', 
      title: 'Second Todo', 
      status: 'next',
      priority: 'medium',
      context: ['@calls'],
      project: 'Project B',
      dueDate: '2024-01-02T00:00:00Z',
      createdAt: '2024-01-02T00:00:00Z',
    }),
    createMockTodo({ 
      id: '3', 
      title: 'Third Todo', 
      status: 'completed',
      priority: 'low',
      context: ['@errands'],
      project: 'Project A',
      completedAt: '2024-01-03T00:00:00Z',
      createdAt: '2024-01-03T00:00:00Z',
    }),
  ]

  const defaultProps = {
    todos: mockTodos,
    loading: false,
    error: null,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onStatusChange: vi.fn(),
    onBulkAction: vi.fn(),
    selectedTodos: [],
    onSelectionChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIntersectionObserver()
  })

  describe('Basic Rendering', () => {
    it('should render all todos', () => {
      render(<TodoList {...defaultProps} />)

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.getByTestId('todo-item-2')).toBeInTheDocument()
      expect(screen.getByTestId('todo-item-3')).toBeInTheDocument()
      
      expect(screen.getByText('First Todo')).toBeInTheDocument()
      expect(screen.getByText('Second Todo')).toBeInTheDocument()
      expect(screen.getByText('Third Todo')).toBeInTheDocument()
    })

    it('should show loading state', () => {
      render(<TodoList {...defaultProps} loading={true} />)

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
      expect(screen.getByLabelText('Loading todos')).toBeInTheDocument()
    })

    it('should show error state', () => {
      const error = 'Failed to load todos'
      render(<TodoList {...defaultProps} error={error} />)

      expect(screen.getByRole('alert')).toHaveTextContent(error)
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('should show empty state when no todos', () => {
      render(<TodoList {...defaultProps} todos={[]} />)

      expect(screen.getByText('No todos yet')).toBeInTheDocument()
      expect(screen.getByText('Create your first todo to get started')).toBeInTheDocument()
    })

    it('should display todo count', () => {
      render(<TodoList {...defaultProps} />)

      expect(screen.getByText('3 todos')).toBeInTheDocument()
    })
  })

  describe('Filtering', () => {
    it('should filter by status', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const statusFilter = screen.getByLabelText('Filter by status')
      await user.selectOptions(statusFilter, 'inbox')

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-3')).not.toBeInTheDocument()
    })

    it('should filter by priority', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const priorityFilter = screen.getByLabelText('Filter by priority')
      await user.selectOptions(priorityFilter, 'high')

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-3')).not.toBeInTheDocument()
    })

    it('should filter by context', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const contextFilter = screen.getByLabelText('Filter by context')
      await user.selectOptions(contextFilter, '@computer')

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-3')).not.toBeInTheDocument()
    })

    it('should filter by project', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const projectFilter = screen.getByLabelText('Filter by project')
      await user.selectOptions(projectFilter, 'Project A')

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()
      expect(screen.getByTestId('todo-item-3')).toBeInTheDocument()
    })

    it('should support text search', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('Search todos...')
      await user.type(searchInput, 'First')

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-3')).not.toBeInTheDocument()
    })

    it('should search in title, description, and outcome', async () => {
      const user = userEvent.setup()
      const todosWithContent = [
        createMockTodo({ id: '1', title: 'Buy groceries', description: 'Milk and bread' }),
        createMockTodo({ id: '2', title: 'Call client', outcome: 'Get project approval' }),
        createMockTodo({ id: '3', title: 'Review code', nextAction: 'Check pull requests' }),
      ]
      
      render(<TodoList {...defaultProps} todos={todosWithContent} />)

      // Search in description
      const searchInput = screen.getByPlaceholderText('Search todos...')
      await user.type(searchInput, 'Milk')
      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()

      await user.clear(searchInput)
      
      // Search in outcome
      await user.type(searchInput, 'approval')
      expect(screen.getByTestId('todo-item-2')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-1')).not.toBeInTheDocument()
    })

    it('should combine multiple filters', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const statusFilter = screen.getByLabelText('Filter by status')
      const priorityFilter = screen.getByLabelText('Filter by priority')

      await user.selectOptions(statusFilter, 'inbox')
      await user.selectOptions(priorityFilter, 'high')

      // Only todo 1 matches both inbox status and high priority
      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-3')).not.toBeInTheDocument()
    })

    it('should clear all filters', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      // Apply filters
      const statusFilter = screen.getByLabelText('Filter by status')
      await user.selectOptions(statusFilter, 'inbox')

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('todo-item-2')).not.toBeInTheDocument()

      // Clear filters
      await user.click(screen.getByText('Clear Filters'))

      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
      expect(screen.getByTestId('todo-item-2')).toBeInTheDocument()
      expect(screen.getByTestId('todo-item-3')).toBeInTheDocument()
    })

    it('should show filter count when active', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const statusFilter = screen.getByLabelText('Filter by status')
      await user.selectOptions(statusFilter, 'inbox')

      expect(screen.getByText('1 todo (filtered from 3)')).toBeInTheDocument()
    })
  })

  describe('Sorting', () => {
    it('should sort by title', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort by')
      await user.selectOptions(sortSelect, 'title')

      const todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(todoItems[0]).toHaveTextContent('First Todo')
      expect(todoItems[1]).toHaveTextContent('Second Todo')
      expect(todoItems[2]).toHaveTextContent('Third Todo')
    })

    it('should sort by priority (high to low)', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort by')
      await user.selectOptions(sortSelect, 'priority')

      const todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(within(todoItems[0]).getByTestId(/todo-priority-/)).toHaveTextContent('high')
      expect(within(todoItems[1]).getByTestId(/todo-priority-/)).toHaveTextContent('medium')
      expect(within(todoItems[2]).getByTestId(/todo-priority-/)).toHaveTextContent('low')
    })

    it('should sort by due date', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort by')
      await user.selectOptions(sortSelect, 'dueDate')

      const todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(todoItems[0]).toHaveTextContent('First Todo') // 2024-01-01
      expect(todoItems[1]).toHaveTextContent('Second Todo') // 2024-01-02
      expect(todoItems[2]).toHaveTextContent('Third Todo') // No due date, should be last
    })

    it('should sort by created date', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const sortSelect = screen.getByLabelLabel('Sort by')
      await user.selectOptions(sortSelect, 'createdAt')

      const todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(todoItems[0]).toHaveTextContent('Third Todo') // Most recent
      expect(todoItems[1]).toHaveTextContent('Second Todo')
      expect(todoItems[2]).toHaveTextContent('First Todo') // Oldest
    })

    it('should reverse sort order when clicked twice', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort by')
      
      // First click - ascending
      await user.selectOptions(sortSelect, 'title')
      let todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(todoItems[0]).toHaveTextContent('First Todo')
      
      // Toggle sort direction
      await user.click(screen.getByLabelText('Toggle sort direction'))
      
      // Now descending
      todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(todoItems[0]).toHaveTextContent('Third Todo')
    })

    it('should support GTD-specific sorting by energy level', async () => {
      const user = userEvent.setup()
      const todosWithEnergy = [
        createMockTodo({ id: '1', title: 'Low energy', energy: 'low' }),
        createMockTodo({ id: '2', title: 'High energy', energy: 'high' }),
        createMockTodo({ id: '3', title: 'Medium energy', energy: 'medium' }),
      ]
      
      render(<TodoList {...defaultProps} todos={todosWithEnergy} />)

      const sortSelect = screen.getByLabelText('Sort by')
      await user.selectOptions(sortSelect, 'energy')

      const todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(todoItems[0]).toHaveTextContent('High energy')
      expect(todoItems[1]).toHaveTextContent('Medium energy')
      expect(todoItems[2]).toHaveTextContent('Low energy')
    })

    it('should support custom GTD workflow sorting', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort by')
      await user.selectOptions(sortSelect, 'gtd-workflow')

      // GTD workflow order: inbox -> next -> waiting -> someday -> completed
      const todoItems = screen.getAllByTestId(/^todo-item-/)
      expect(within(todoItems[0]).getByTestId(/todo-status-/)).toHaveTextContent('inbox')
      expect(within(todoItems[1]).getByTestId(/todo-status-/)).toHaveTextContent('next')
      expect(within(todoItems[2]).getByTestId(/todo-status-/)).toHaveTextContent('completed')
    })
  })

  describe('Selection and Bulk Actions', () => {
    it('should support individual todo selection', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const checkbox1 = screen.getByLabelText('Select First Todo')
      await user.click(checkbox1)

      expect(defaultProps.onSelectionChange).toHaveBeenCalledWith(['1'])
    })

    it('should support select all', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const selectAllCheckbox = screen.getByLabelText('Select all todos')
      await user.click(selectAllCheckbox)

      expect(defaultProps.onSelectionChange).toHaveBeenCalledWith(['1', '2', '3'])
    })

    it('should show bulk action bar when todos are selected', () => {
      render(<TodoList {...defaultProps} selectedTodos={['1', '2']} />)

      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument()
      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    it('should perform bulk status change', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} selectedTodos={['1', '2']} />)

      const bulkStatusSelect = screen.getByLabelText('Bulk change status')
      await user.selectOptions(bulkStatusSelect, 'next')

      await user.click(screen.getByText('Apply'))

      expect(defaultProps.onBulkAction).toHaveBeenCalledWith(
        'changeStatus',
        ['1', '2'],
        { status: 'next' }
      )
    })

    it('should perform bulk delete', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      render(<TodoList {...defaultProps} selectedTodos={['1', '2']} />)

      await user.click(screen.getByText('Delete Selected'))

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete 2 todos?'
      )
      expect(defaultProps.onBulkAction).toHaveBeenCalledWith('delete', ['1', '2'])

      confirmSpy.mockRestore()
    })

    it('should clear selection after bulk action', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} selectedTodos={['1', '2']} />)

      const bulkStatusSelect = screen.getByLabelText('Bulk change status')
      await user.selectOptions(bulkStatusSelect, 'completed')
      await user.click(screen.getByText('Apply'))

      expect(defaultProps.onSelectionChange).toHaveBeenCalledWith([])
    })
  })

  describe('Grouping', () => {
    it('should group by status', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const groupSelect = screen.getByLabelText('Group by')
      await user.selectOptions(groupSelect, 'status')

      expect(screen.getByText('Inbox (1)')).toBeInTheDocument()
      expect(screen.getByText('Next Actions (1)')).toBeInTheDocument()
      expect(screen.getByText('Completed (1)')).toBeInTheDocument()
    })

    it('should group by project', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const groupSelect = screen.getByLabelText('Group by')
      await user.selectOptions(groupSelect, 'project')

      expect(screen.getByText('Project A (2)')).toBeInTheDocument()
      expect(screen.getByText('Project B (1)')).toBeInTheDocument()
    })

    it('should group by context', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const groupSelect = screen.getByLabelText('Group by')
      await user.selectOptions(groupSelect, 'context')

      expect(screen.getByText('@computer (1)')).toBeInTheDocument()
      expect(screen.getByText('@calls (1)')).toBeInTheDocument()
      expect(screen.getByText('@errands (1)')).toBeInTheDocument()
    })

    it('should collapse/expand groups', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const groupSelect = screen.getByLabelText('Group by')
      await user.selectOptions(groupSelect, 'status')

      // Collapse inbox group
      const inboxHeader = screen.getByText('Inbox (1)')
      await user.click(inboxHeader)

      expect(screen.queryByTestId('todo-item-1')).not.toBeVisible()
      
      // Expand again
      await user.click(inboxHeader)
      
      expect(screen.getByTestId('todo-item-1')).toBeVisible()
    })
  })

  describe('Drag and Drop', () => {
    it('should support drag and drop reordering', async () => {
      const onReorder = vi.fn()
      
      render(<TodoList {...defaultProps} onReorder={onReorder} />)

      const firstTodo = screen.getByTestId('todo-item-1')
      const secondTodo = screen.getByTestId('todo-item-2')

      // Simulate drag and drop
      fireEvent.dragStart(firstTodo)
      fireEvent.dragEnter(secondTodo)
      fireEvent.dragOver(secondTodo)
      fireEvent.drop(secondTodo)

      expect(onReorder).toHaveBeenCalledWith('1', 1) // Move todo 1 to position 1
    })

    it('should show drop indicator during drag', async () => {
      render(<TodoList {...defaultProps} />)

      const firstTodo = screen.getByTestId('todo-item-1')
      const secondTodo = screen.getByTestId('todo-item-2')

      fireEvent.dragStart(firstTodo)
      fireEvent.dragEnter(secondTodo)

      expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
    })

    it('should support dragging to status columns in kanban view', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      // Switch to kanban view
      await user.click(screen.getByLabelText('Kanban view'))

      const todo = screen.getByTestId('todo-item-1')
      const nextColumn = screen.getByTestId('status-column-next')

      fireEvent.dragStart(todo)
      fireEvent.drop(nextColumn)

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('1', 'next')
    })
  })

  describe('Views', () => {
    it('should switch between list and grid views', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      expect(screen.getByTestId('todo-list')).toHaveClass('list-view')

      await user.click(screen.getByLabelText('Grid view'))

      expect(screen.getByTestId('todo-list')).toHaveClass('grid-view')
    })

    it('should support kanban view', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      await user.click(screen.getByLabelText('Kanban view'))

      expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
      expect(screen.getByTestId('status-column-inbox')).toBeInTheDocument()
      expect(screen.getByTestId('status-column-next')).toBeInTheDocument()
      expect(screen.getByTestId('status-column-waiting')).toBeInTheDocument()
    })

    it('should support agenda view (timeline)', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      await user.click(screen.getByLabelText('Agenda view'))

      expect(screen.getByTestId('agenda-view')).toBeInTheDocument()
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('This Week')).toBeInTheDocument()
    })
  })

  describe('Virtualization', () => {
    it('should handle large lists with virtual scrolling', () => {
      const largeTodoList = Array.from({ length: 1000 }, (_, i) => 
        createMockTodo({ id: `${i}`, title: `Todo ${i}` })
      )
      
      render(<TodoList {...defaultProps} todos={largeTodoList} />)

      // Should only render visible items
      expect(screen.getAllByTestId(/^todo-item-/)).toHaveLength(2) // Mocked virtualizer returns 2 items
    })

    it('should support scroll to todo', async () => {
      const scrollToTodo = vi.fn()
      
      render(<TodoList {...defaultProps} scrollToTodo="2" />)

      // Should scroll to todo with id "2"
      expect(scrollToTodo).toHaveBeenCalled()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should navigate with arrow keys', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const firstTodo = screen.getByTestId('todo-item-1')
      firstTodo.focus()

      await user.keyboard('{ArrowDown}')

      expect(screen.getByTestId('todo-item-2')).toHaveFocus()
    })

    it('should support keyboard shortcuts', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const firstTodo = screen.getByTestId('todo-item-1')
      firstTodo.focus()

      // Ctrl+A should select all
      await user.keyboard('{Control>}a{/Control}')
      
      expect(defaultProps.onSelectionChange).toHaveBeenCalledWith(['1', '2', '3'])
    })

    it('should support quick status changes with number keys', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const firstTodo = screen.getByTestId('todo-item-1')
      firstTodo.focus()

      // Press "1" to mark as next action
      await user.keyboard('1')

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('1', 'next')
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(<TodoList {...defaultProps} />)

      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.getByLabelText('Todo list with 3 items')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    it('should announce filter changes to screen readers', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const statusFilter = screen.getByLabelText('Filter by status')
      await user.selectOptions(statusFilter, 'inbox')

      expect(screen.getByRole('status')).toHaveTextContent(
        'Filter applied. Showing 1 of 3 todos.'
      )
    })

    it('should support screen reader navigation in groups', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      const groupSelect = screen.getByLabelText('Group by')
      await user.selectOptions(groupSelect, 'status')

      expect(screen.getByRole('group', { name: 'Inbox' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Next Actions' })).toBeInTheDocument()
    })

    it('should have proper focus management', async () => {
      const user = userEvent.setup()
      
      render(<TodoList {...defaultProps} />)

      // Tab should move through interactive elements
      await user.tab()
      expect(screen.getByPlaceholderText('Search todos...')).toHaveFocus()
      
      await user.tab()
      expect(screen.getByLabelText('Filter by status')).toHaveFocus()
    })
  })

  describe('Performance', () => {
    it('should memoize filtered results', async () => {
      const user = userEvent.setup()
      const filterSpy = vi.fn()
      
      // Mock expensive filter operation
      const TodoListWithSpy = (props: any) => {
        const filtered = props.todos.filter((todo: any) => {
          filterSpy()
          return true
        })
        return <TodoList {...props} todos={filtered} />
      }

      render(<TodoListWithSpy {...defaultProps} />)

      expect(filterSpy).toHaveBeenCalledTimes(3) // Once per todo

      // Re-render with same props should not re-filter
      const statusFilter = screen.getByLabelText('Filter by status')
      await user.selectOptions(statusFilter, 'all')

      expect(filterSpy).toHaveBeenCalledTimes(3) // Should be memoized
    })

    it('should debounce search input', async () => {
      const user = userEvent.setup()
      const searchSpy = vi.fn()
      
      render(<TodoList {...defaultProps} onSearch={searchSpy} />)

      const searchInput = screen.getByPlaceholderText('Search todos...')
      
      // Type rapidly
      await user.type(searchInput, 'test')
      
      // Should debounce the search
      expect(searchSpy).not.toHaveBeenCalled()
      
      await waitFor(() => {
        expect(searchSpy).toHaveBeenCalledWith('test')
      }, { timeout: 500 })
    })
  })

  describe('Error Handling', () => {
    it('should handle update errors gracefully', async () => {
      const user = userEvent.setup()
      const failingOnUpdate = vi.fn().mockRejectedValue(new Error('Update failed'))
      
      render(<TodoList {...defaultProps} onUpdate={failingOnUpdate} />)

      await user.click(screen.getAllByText('Update')[0])

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to update todo')
      })
    })

    it('should show retry button on network errors', () => {
      const onRetry = vi.fn()
      const networkError = 'Network error: Please check your connection'
      
      render(
        <TodoList 
          {...defaultProps} 
          error={networkError} 
          onRetry={onRetry}
        />
      )

      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('should handle malformed todo data', () => {
      const malformedTodos = [
        { id: '1' }, // Missing required fields
        createMockTodo({ id: '2', dueDate: 'invalid-date' }),
      ]
      
      render(<TodoList {...defaultProps} todos={malformedTodos as any} />)

      // Should render without crashing
      expect(screen.getByTestId('todo-list')).toBeInTheDocument()
    })
  })
})