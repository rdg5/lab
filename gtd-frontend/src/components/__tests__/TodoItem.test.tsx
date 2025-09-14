import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoItem } from '../TodoItem'
import { render, createMockTodo, createMockSubtask } from '../../test/utils/test-utils'

// Mock the components that will be imported
vi.mock('../ContextTags', () => ({
  ContextTags: ({ contexts, onAdd, onRemove }: any) => (
    <div data-testid="context-tags">
      {contexts?.map((context: string) => (
        <span key={context} data-testid={`context-${context}`}>
          {context}
          <button onClick={() => onRemove?.(context)}>Remove {context}</button>
        </span>
      ))}
      <button onClick={() => onAdd?.('@test')}>Add Context</button>
    </div>
  ),
}))

vi.mock('../SubtaskManager', () => ({
  SubtaskManager: ({ todoId, subtasks, onUpdate }: any) => (
    <div data-testid="subtask-manager">
      <div data-testid="subtask-count">{subtasks?.length || 0} subtasks</div>
      <button onClick={() => onUpdate?.('add', { title: 'New subtask' })}>
        Add Subtask
      </button>
    </div>
  ),
}))

describe('TodoItem Component', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnStatusChange = vi.fn()
  const mockOnContextChange = vi.fn()

  const defaultProps = {
    todo: createMockTodo(),
    onUpdate: mockOnUpdate,
    onDelete: mockOnDelete,
    onStatusChange: mockOnStatusChange,
    onContextChange: mockOnContextChange,
    isSelected: false,
    showSubtasks: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render todo title and description', () => {
      render(<TodoItem {...defaultProps} />)
      
      expect(screen.getByText('Test Todo')).toBeInTheDocument()
      expect(screen.getByText('Test description')).toBeInTheDocument()
    })

    it('should display GTD-specific fields', () => {
      const todoWithGTD = createMockTodo({
        outcome: 'Complete project successfully',
        nextAction: 'Call client about requirements',
        project: 'Website Redesign',
        energy: 'high',
      })

      render(<TodoItem {...defaultProps} todo={todoWithGTD} />)

      expect(screen.getByText('Complete project successfully')).toBeInTheDocument()
      expect(screen.getByText('Call client about requirements')).toBeInTheDocument()
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
      expect(screen.getByTestId('energy-level')).toHaveTextContent('high')
    })

    it('should show estimated and actual time when available', () => {
      const todoWithTime = createMockTodo({
        estimatedMinutes: 45,
        actualMinutes: 60,
      })

      render(<TodoItem {...defaultProps} todo={todoWithTime} />)

      expect(screen.getByText('Est: 45m')).toBeInTheDocument()
      expect(screen.getByText('Actual: 60m')).toBeInTheDocument()
    })

    it('should display priority indicator', () => {
      const highPriorityTodo = createMockTodo({ priority: 'high' })
      
      render(<TodoItem {...defaultProps} todo={highPriorityTodo} />)
      
      expect(screen.getByTestId('priority-indicator')).toHaveClass('priority-high')
    })

    it('should show due date when present', () => {
      const todoWithDueDate = createMockTodo({
        dueDate: '2024-12-31T23:59:59Z',
      })

      render(<TodoItem {...defaultProps} todo={todoWithDueDate} />)

      expect(screen.getByText(/Dec 31, 2024/)).toBeInTheDocument()
    })

    it('should indicate overdue items', () => {
      const overdueTodo = createMockTodo({
        dueDate: '2023-01-01T00:00:00Z', // Past date
      })

      render(<TodoItem {...defaultProps} todo={overdueTodo} />)

      expect(screen.getByTestId('due-date')).toHaveClass('overdue')
    })
  })

  describe('Status and State Management', () => {
    it('should display correct status badge', () => {
      const statuses = ['inbox', 'next', 'waiting', 'someday', 'completed'] as const
      
      statuses.forEach(status => {
        const todo = createMockTodo({ status })
        const { rerender } = render(<TodoItem {...defaultProps} todo={todo} />)
        
        expect(screen.getByTestId('status-badge')).toHaveTextContent(status)
        rerender(<div />)
      })
    })

    it('should show completed styling for completed todos', () => {
      const completedTodo = createMockTodo({ 
        status: 'completed',
        completedAt: '2024-01-01T12:00:00Z',
      })

      render(<TodoItem {...defaultProps} todo={completedTodo} />)

      expect(screen.getByTestId('todo-item')).toHaveClass('completed')
      expect(screen.getByText(/Completed on/)).toBeInTheDocument()
    })

    it('should handle status change on checkbox click', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      const checkbox = screen.getByRole('checkbox')
      await user.click(checkbox)

      expect(mockOnStatusChange).toHaveBeenCalledWith(
        defaultProps.todo.id,
        'completed'
      )
    })

    it('should show sync status indicator', () => {
      const unsyncedTodo = createMockTodo({ syncStatus: 'pending' })
      
      render(<TodoItem {...defaultProps} todo={unsyncedTodo} />)
      
      expect(screen.getByTestId('sync-status')).toHaveClass('sync-pending')
    })

    it('should display offline changes indicator', () => {
      const todoWithOfflineChanges = createMockTodo({
        offlineChanges: [
          {
            id: '1',
            todoId: '1',
            action: 'update',
            data: { title: 'Updated title' },
            timestamp: '2024-01-01T12:00:00Z',
            synced: false,
          },
        ],
      })

      render(<TodoItem {...defaultProps} todo={todoWithOfflineChanges} />)

      expect(screen.getByTestId('offline-changes-indicator')).toBeInTheDocument()
    })
  })

  describe('Interactive Features', () => {
    it('should toggle expanded state on click', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      expect(screen.queryByText('Test description')).not.toBeVisible()
      
      await user.click(screen.getByTestId('todo-header'))
      
      expect(screen.getByText('Test description')).toBeVisible()
    })

    it('should enter edit mode when edit button is clicked', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit todo'))

      expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /outcome/i })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /next action/i })).toBeInTheDocument()
    })

    it('should save changes in edit mode', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit todo'))
      
      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Title')

      await user.click(screen.getByText('Save'))

      expect(mockOnUpdate).toHaveBeenCalledWith(
        defaultProps.todo.id,
        expect.objectContaining({ title: 'Updated Title' })
      )
    })

    it('should cancel edit mode without saving', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit todo'))
      
      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.clear(titleInput)
      await user.type(titleInput, 'Should not be saved')

      await user.click(screen.getByText('Cancel'))

      expect(mockOnUpdate).not.toHaveBeenCalled()
      expect(screen.getByText('Test Todo')).toBeInTheDocument()
    })

    it('should handle delete action with confirmation', async () => {
      const user = userEvent.setup()
      
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByLabelText('Delete todo'))

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete this todo?'
      )
      expect(mockOnDelete).toHaveBeenCalledWith(defaultProps.todo.id)

      confirmSpy.mockRestore()
    })

    it('should not delete when confirmation is cancelled', async () => {
      const user = userEvent.setup()
      
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByLabelText('Delete todo'))

      expect(mockOnDelete).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })
  })

  describe('Context Tags Integration', () => {
    it('should render context tags component', () => {
      const todoWithContexts = createMockTodo({
        context: ['@computer', '@calls', '@errands'],
      })

      render(<TodoItem {...defaultProps} todo={todoWithContexts} />)

      expect(screen.getByTestId('context-tags')).toBeInTheDocument()
      expect(screen.getByTestId('context-@computer')).toBeInTheDocument()
      expect(screen.getByTestId('context-@calls')).toBeInTheDocument()
      expect(screen.getByTestId('context-@errands')).toBeInTheDocument()
    })

    it('should handle context addition', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByText('Add Context'))

      expect(mockOnContextChange).toHaveBeenCalledWith(
        defaultProps.todo.id,
        'add',
        '@test'
      )
    })

    it('should handle context removal', async () => {
      const user = userEvent.setup()
      const todoWithContexts = createMockTodo({
        context: ['@computer'],
      })

      render(<TodoItem {...defaultProps} todo={todoWithContexts} />)

      await user.click(screen.getByText('Remove @computer'))

      expect(mockOnContextChange).toHaveBeenCalledWith(
        todoWithContexts.id,
        'remove',
        '@computer'
      )
    })
  })

  describe('Subtasks Integration', () => {
    it('should render subtask manager when subtasks are present', () => {
      const todoWithSubtasks = createMockTodo({
        subtasks: [
          createMockSubtask({ id: '1', title: 'Subtask 1' }),
          createMockSubtask({ id: '2', title: 'Subtask 2', completed: true }),
        ],
      })

      render(<TodoItem {...defaultProps} todo={todoWithSubtasks} />)

      expect(screen.getByTestId('subtask-manager')).toBeInTheDocument()
      expect(screen.getByTestId('subtask-count')).toHaveTextContent('2 subtasks')
    })

    it('should show subtask progress indicator', () => {
      const todoWithSubtasks = createMockTodo({
        subtasks: [
          createMockSubtask({ id: '1', completed: false }),
          createMockSubtask({ id: '2', completed: true }),
          createMockSubtask({ id: '3', completed: true }),
        ],
      })

      render(<TodoItem {...defaultProps} todo={todoWithSubtasks} />)

      expect(screen.getByTestId('subtask-progress')).toHaveTextContent('2/3')
      expect(screen.getByTestId('progress-bar')).toHaveStyle('width: 66.67%')
    })

    it('should hide subtasks when showSubtasks is false', () => {
      const todoWithSubtasks = createMockTodo({
        subtasks: [createMockSubtask()],
      })

      render(
        <TodoItem 
          {...defaultProps} 
          todo={todoWithSubtasks}
          showSubtasks={false}
        />
      )

      expect(screen.queryByTestId('subtask-manager')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<TodoItem {...defaultProps} />)

      expect(screen.getByLabelText('Mark as complete')).toBeInTheDocument()
      expect(screen.getByLabelText('Edit todo')).toBeInTheDocument()
      expect(screen.getByLabelText('Delete todo')).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      const todoItem = screen.getByTestId('todo-item')
      todoItem.focus()

      await user.keyboard('{Enter}')
      
      // Should expand/collapse on Enter
      expect(screen.getByText('Test description')).toBeVisible()
    })

    it('should have proper focus management in edit mode', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit todo'))

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      expect(titleInput).toHaveFocus()
    })

    it('should announce status changes to screen readers', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      const checkbox = screen.getByRole('checkbox')
      await user.click(checkbox)

      expect(screen.getByRole('status')).toHaveTextContent('Todo marked as complete')
    })
  })

  describe('Responsive Design', () => {
    it('should adapt layout for mobile screens', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })
      
      render(<TodoItem {...defaultProps} />)

      expect(screen.getByTestId('todo-item')).toHaveClass('mobile-layout')
    })

    it('should show condensed view on small screens', () => {
      // Mock small screen
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(max-width: 768px)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      render(<TodoItem {...defaultProps} />)

      // Some elements should be hidden in condensed view
      expect(screen.queryByText('Test description')).not.toBeVisible()
      expect(screen.getByTestId('condensed-info')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle update errors gracefully', async () => {
      const user = userEvent.setup()
      const failingOnUpdate = vi.fn().mockRejectedValue(new Error('Update failed'))
      
      render(<TodoItem {...defaultProps} onUpdate={failingOnUpdate} />)

      await user.click(screen.getByLabelText('Edit todo'))
      await user.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to update todo')
      })
    })

    it('should handle missing GTD fields gracefully', () => {
      const incompleteTodo = createMockTodo({
        outcome: undefined,
        nextAction: undefined,
        context: undefined,
      })

      render(<TodoItem {...defaultProps} todo={incompleteTodo} />)

      expect(screen.getByText('Test Todo')).toBeInTheDocument()
      // Should render without crashing
    })

    it('should handle invalid date formats', () => {
      const todoWithInvalidDate = createMockTodo({
        dueDate: 'invalid-date',
      })

      render(<TodoItem {...defaultProps} todo={todoWithInvalidDate} />)

      expect(screen.getByTestId('due-date')).toHaveTextContent('Invalid date')
    })
  })

  describe('Performance', () => {
    it('should not re-render unnecessarily when props are the same', () => {
      const renderSpy = vi.fn()
      
      const TodoItemWithSpy = (props: any) => {
        renderSpy()
        return <TodoItem {...props} />
      }

      const { rerender } = render(
        <TodoItemWithSpy {...defaultProps} />
      )

      expect(renderSpy).toHaveBeenCalledTimes(1)

      // Re-render with same props
      rerender(<TodoItemWithSpy {...defaultProps} />)

      // Should have been memoized and not re-rendered
      expect(renderSpy).toHaveBeenCalledTimes(1)
    })

    it('should debounce rapid edit operations', async () => {
      const user = userEvent.setup()
      
      render(<TodoItem {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit todo'))
      
      const titleInput = screen.getByRole('textbox', { name: /title/i })
      
      // Type rapidly
      await user.type(titleInput, 'Quick edits')
      
      // Should debounce the updates
      expect(mockOnUpdate).not.toHaveBeenCalled()
      
      // Wait for debounce
      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalledTimes(1)
      }, { timeout: 1000 })
    })
  })
})