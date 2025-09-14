import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubtaskManager } from '../SubtaskManager'
import { render, createMockTodo, createMockSubtask } from '../../test/utils/test-utils'

// Mock drag and drop library
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: any) => <div onDrop={() => onDragEnd?.({ active: { id: '1' }, over: { id: '2' } })}>{children}</div>,
  useDraggable: () => ({
    attributes: {},
    listeners: { onMouseDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
  }),
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  useSortable: () => ({
    attributes: {},
    listeners: { onMouseDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}))

describe('SubtaskManager Component', () => {
  const mockSubtasks = [
    createMockSubtask({
      id: '1',
      todoId: 'parent-1',
      title: 'First subtask',
      completed: false,
    }),
    createMockSubtask({
      id: '2',
      todoId: 'parent-1',
      title: 'Second subtask',
      completed: true,
    }),
    createMockSubtask({
      id: '3',
      todoId: 'parent-1',
      title: 'Third subtask',
      completed: false,
    }),
  ]

  const defaultProps = {
    todoId: 'parent-1',
    subtasks: mockSubtasks,
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    onToggleComplete: vi.fn(),
    isReadOnly: false,
    showCompleted: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render all subtasks', () => {
      render(<SubtaskManager {...defaultProps} />)

      expect(screen.getByText('First subtask')).toBeInTheDocument()
      expect(screen.getByText('Second subtask')).toBeInTheDocument()
      expect(screen.getByText('Third subtask')).toBeInTheDocument()
    })

    it('should show subtask progress', () => {
      render(<SubtaskManager {...defaultProps} />)

      expect(screen.getByTestId('subtask-progress')).toHaveTextContent('1 of 3 completed')
      expect(screen.getByTestId('progress-bar')).toHaveStyle('width: 33.33%')
    })

    it('should show empty state when no subtasks', () => {
      render(<SubtaskManager {...defaultProps} subtasks={[]} />)

      expect(screen.getByText('No subtasks yet')).toBeInTheDocument()
      expect(screen.getByText('Break down this task into smaller steps')).toBeInTheDocument()
    })

    it('should hide completed subtasks when showCompleted is false', () => {
      render(<SubtaskManager {...defaultProps} showCompleted={false} />)

      expect(screen.getByText('First subtask')).toBeInTheDocument()
      expect(screen.queryByText('Second subtask')).not.toBeInTheDocument()
      expect(screen.getByText('Third subtask')).toBeInTheDocument()
    })

    it('should display completed count when hiding completed items', () => {
      render(<SubtaskManager {...defaultProps} showCompleted={false} />)

      expect(screen.getByText('1 completed item hidden')).toBeInTheDocument()
    })

    it('should show add button when not read-only', () => {
      render(<SubtaskManager {...defaultProps} />)

      expect(screen.getByRole('button', { name: /add subtask/i })).toBeInTheDocument()
    })

    it('should hide add button when read-only', () => {
      render(<SubtaskManager {...defaultProps} isReadOnly={true} />)

      expect(screen.queryByRole('button', { name: /add subtask/i })).not.toBeInTheDocument()
    })
  })

  describe('Adding Subtasks', () => {
    it('should add new subtask with Enter key', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add subtask/i }))

      const input = screen.getByPlaceholderText('Add a subtask...')
      await user.type(input, 'New subtask')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).toHaveBeenCalledWith({
        title: 'New subtask',
        completed: false,
      })
    })

    it('should add new subtask with Add button', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add subtask/i }))

      const input = screen.getByPlaceholderText('Add a subtask...')
      await user.type(input, 'Another subtask')
      await user.click(screen.getByText('Add'))

      expect(defaultProps.onAdd).toHaveBeenCalledWith({
        title: 'Another subtask',
        completed: false,
      })
    })

    it('should not add empty subtask', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add subtask/i }))

      const input = screen.getByPlaceholderText('Add a subtask...')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).not.toHaveBeenCalled()
    })

    it('should clear input after adding subtask', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add subtask/i }))

      const input = screen.getByPlaceholderText('Add a subtask...')
      await user.type(input, 'Test subtask')
      await user.keyboard('{Enter}')

      expect(input).toHaveValue('')
    })

    it('should cancel adding subtask with Escape', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add subtask/i }))

      const input = screen.getByPlaceholderText('Add a subtask...')
      await user.type(input, 'Will be cancelled')
      await user.keyboard('{Escape}')

      expect(screen.queryByPlaceholderText('Add a subtask...')).not.toBeInTheDocument()
      expect(defaultProps.onAdd).not.toHaveBeenCalled()
    })

    it('should focus input when add button is clicked', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add subtask/i }))

      expect(screen.getByPlaceholderText('Add a subtask...')).toHaveFocus()
    })
  })

  describe('Updating Subtasks', () => {
    it('should enter edit mode when subtask is clicked', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByText('First subtask'))

      expect(screen.getByRole('textbox')).toHaveValue('First subtask')
    })

    it('should save changes with Enter', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByText('First subtask'))

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'Updated subtask')
      await user.keyboard('{Enter}')

      expect(defaultProps.onUpdate).toHaveBeenCalledWith('1', {
        title: 'Updated subtask',
      })
    })

    it('should save changes on blur', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByText('First subtask'))

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'Blur updated')
      await user.tab() // Blur the input

      expect(defaultProps.onUpdate).toHaveBeenCalledWith('1', {
        title: 'Blur updated',
      })
    })

    it('should cancel edit with Escape', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByText('First subtask'))

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'Should not be saved')
      await user.keyboard('{Escape}')

      expect(screen.getByText('First subtask')).toBeInTheDocument()
      expect(defaultProps.onUpdate).not.toHaveBeenCalled()
    })

    it('should not save empty subtask title', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByText('First subtask'))

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.keyboard('{Enter}')

      expect(screen.getByText('Title cannot be empty')).toBeInTheDocument()
      expect(defaultProps.onUpdate).not.toHaveBeenCalled()
    })

    it('should prevent editing in read-only mode', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} isReadOnly={true} />)

      await user.click(screen.getByText('First subtask'))

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('Completing Subtasks', () => {
    it('should toggle completion with checkbox', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const checkbox = screen.getByLabelText('Mark First subtask as complete')
      await user.click(checkbox)

      expect(defaultProps.onToggleComplete).toHaveBeenCalledWith('1', true)
    })

    it('should show completed styling for completed subtasks', () => {
      render(<SubtaskManager {...defaultProps} />)

      const completedSubtask = screen.getByTestId('subtask-2')
      expect(completedSubtask).toHaveClass('completed')
    })

    it('should not allow completion toggle in read-only mode', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} isReadOnly={true} />)

      const checkbox = screen.getByLabelText('Mark First subtask as complete')
      expect(checkbox).toBeDisabled()
    })

    it('should update progress when subtask is completed', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const checkbox = screen.getByLabelText('Mark First subtask as complete')
      await user.click(checkbox)

      // Should show optimistic update
      expect(screen.getByTestId('subtask-progress')).toHaveTextContent('2 of 3 completed')
    })
  })

  describe('Deleting Subtasks', () => {
    it('should delete subtask when delete button is clicked', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const deleteButton = screen.getByLabelText('Delete First subtask')
      await user.click(deleteButton)

      expect(defaultProps.onDelete).toHaveBeenCalledWith('1')
    })

    it('should confirm deletion for important subtasks', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      const importantSubtask = createMockSubtask({
        id: '1',
        title: 'Important subtask with detailed description',
      })
      
      render(<SubtaskManager {...defaultProps} subtasks={[importantSubtask]} />)

      await user.click(screen.getByLabelText('Delete Important subtask with detailed description'))

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete this subtask?'
      )
      expect(defaultProps.onDelete).toHaveBeenCalledWith('1')

      confirmSpy.mockRestore()
    })

    it('should not delete when confirmation is cancelled', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByLabelText('Delete First subtask'))

      expect(defaultProps.onDelete).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    it('should hide delete button in read-only mode', () => {
      render(<SubtaskManager {...defaultProps} isReadOnly={true} />)

      expect(screen.queryByLabelText('Delete First subtask')).not.toBeInTheDocument()
    })
  })

  describe('Drag and Drop Reordering', () => {
    it('should reorder subtasks when dragged', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const firstSubtask = screen.getByTestId('subtask-1')
      const secondSubtask = screen.getByTestId('subtask-2')

      // Simulate drag and drop
      await user.hover(firstSubtask)
      const dragHandle = within(firstSubtask).getByTestId('drag-handle')
      
      // Drag first subtask to second position
      fireEvent.mouseDown(dragHandle)
      fireEvent.mouseMove(secondSubtask)
      fireEvent.mouseUp(secondSubtask)

      expect(defaultProps.onReorder).toHaveBeenCalledWith('1', 1)
    })

    it('should show drag preview during drag', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const dragHandle = screen.getAllByTestId('drag-handle')[0]
      
      await user.hover(dragHandle)
      fireEvent.mouseDown(dragHandle)

      expect(screen.getByTestId('drag-preview')).toBeInTheDocument()
    })

    it('should disable drag in read-only mode', () => {
      render(<SubtaskManager {...defaultProps} isReadOnly={true} />)

      expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument()
    })

    it('should show drop indicator during drag', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const dragHandle = screen.getAllByTestId('drag-handle')[0]
      const secondSubtask = screen.getByTestId('subtask-2')

      fireEvent.mouseDown(dragHandle)
      fireEvent.mouseEnter(secondSubtask)

      expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
    })
  })

  describe('Bulk Operations', () => {
    it('should support selecting multiple subtasks', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const firstCheckbox = screen.getByLabelText('Select First subtask')
      const thirdCheckbox = screen.getByLabelText('Select Third subtask')

      await user.click(firstCheckbox)
      await user.click(thirdCheckbox)

      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    it('should select all subtasks', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByLabelText('Select all subtasks'))

      expect(screen.getByText('3 selected')).toBeInTheDocument()
    })

    it('should mark selected subtasks as complete', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const firstCheckbox = screen.getByLabelText('Select First subtask')
      const thirdCheckbox = screen.getByLabelText('Select Third subtask')

      await user.click(firstCheckbox)
      await user.click(thirdCheckbox)

      await user.click(screen.getByText('Mark Complete'))

      expect(defaultProps.onToggleComplete).toHaveBeenCalledWith('1', true)
      expect(defaultProps.onToggleComplete).toHaveBeenCalledWith('3', true)
    })

    it('should delete selected subtasks', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      render(<SubtaskManager {...defaultProps} />)

      const firstCheckbox = screen.getByLabelText('Select First subtask')
      const thirdCheckbox = screen.getByLabelText('Select Third subtask')

      await user.click(firstCheckbox)
      await user.click(thirdCheckbox)

      await user.click(screen.getByText('Delete Selected'))

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete 2 subtasks?'
      )
      expect(defaultProps.onDelete).toHaveBeenCalledWith('1')
      expect(defaultProps.onDelete).toHaveBeenCalledWith('3')

      confirmSpy.mockRestore()
    })

    it('should clear selection after bulk operation', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const firstCheckbox = screen.getByLabelText('Select First subtask')
      await user.click(firstCheckbox)

      expect(screen.getByText('1 selected')).toBeInTheDocument()

      await user.click(screen.getByText('Mark Complete'))

      expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    })
  })

  describe('Filtering and Sorting', () => {
    it('should filter subtasks by completion status', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const filterSelect = screen.getByLabelText('Filter subtasks')
      await user.selectOptions(filterSelect, 'incomplete')

      expect(screen.getByText('First subtask')).toBeInTheDocument()
      expect(screen.queryByText('Second subtask')).not.toBeInTheDocument()
      expect(screen.getByText('Third subtask')).toBeInTheDocument()
    })

    it('should sort subtasks alphabetically', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const sortButton = screen.getByLabelText('Sort subtasks alphabetically')
      await user.click(sortButton)

      const subtaskItems = screen.getAllByTestId(/^subtask-/)
      expect(subtaskItems[0]).toHaveTextContent('First subtask')
      expect(subtaskItems[1]).toHaveTextContent('Second subtask')
      expect(subtaskItems[2]).toHaveTextContent('Third subtask')
    })

    it('should sort subtasks by completion status', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort subtasks by')
      await user.selectOptions(sortSelect, 'status')

      // Incomplete subtasks should come first
      const subtaskItems = screen.getAllByTestId(/^subtask-/)
      expect(within(subtaskItems[0]).getByRole('checkbox')).not.toBeChecked()
      expect(within(subtaskItems[1]).getByRole('checkbox')).not.toBeChecked()
      expect(within(subtaskItems[2]).getByRole('checkbox')).toBeChecked()
    })
  })

  describe('Templates and Quick Add', () => {
    it('should show common subtask templates', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByText('Templates'))

      expect(screen.getByText('Research')).toBeInTheDocument()
      expect(screen.getByText('Plan')).toBeInTheDocument()
      expect(screen.getByText('Execute')).toBeInTheDocument()
      expect(screen.getByText('Review')).toBeInTheDocument()
    })

    it('should add template subtasks', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      await user.click(screen.getByText('Templates'))
      await user.click(screen.getByText('Research'))

      expect(defaultProps.onAdd).toHaveBeenCalledWith({
        title: 'Research',
        completed: false,
      })
    })

    it('should support custom templates based on todo context', async () => {
      const user = userEvent.setup()
      const todoWithContext = createMockTodo({ context: ['@calls'] })
      
      render(
        <SubtaskManager 
          {...defaultProps} 
          parentTodo={todoWithContext}
        />
      )

      await user.click(screen.getByText('Templates'))

      expect(screen.getByText('Prepare talking points')).toBeInTheDocument()
      expect(screen.getByText('Schedule call')).toBeInTheDocument()
      expect(screen.getByText('Follow up')).toBeInTheDocument()
    })

    it('should suggest subtasks based on LLM analysis', async () => {
      const user = userEvent.setup()
      
      render(
        <SubtaskManager 
          {...defaultProps} 
          llmSuggestions={[
            'Break down requirements',
            'Create mockups',
            'Get stakeholder approval',
          ]}
        />
      )

      await user.click(screen.getByText('AI Suggestions'))

      expect(screen.getByText('Break down requirements')).toBeInTheDocument()
      expect(screen.getByText('Create mockups')).toBeInTheDocument()
      expect(screen.getByText('Get stakeholder approval')).toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should navigate subtasks with arrow keys', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const firstSubtask = screen.getByTestId('subtask-1')
      firstSubtask.focus()

      await user.keyboard('{ArrowDown}')

      expect(screen.getByTestId('subtask-2')).toHaveFocus()
    })

    it('should complete subtask with spacebar', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const firstSubtask = screen.getByTestId('subtask-1')
      firstSubtask.focus()

      await user.keyboard(' ')

      expect(defaultProps.onToggleComplete).toHaveBeenCalledWith('1', true)
    })

    it('should enter edit mode with Enter key', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const firstSubtask = screen.getByTestId('subtask-1')
      firstSubtask.focus()

      await user.keyboard('{Enter}')

      expect(screen.getByRole('textbox')).toHaveValue('First subtask')
    })

    it('should delete subtask with Delete key', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      render(<SubtaskManager {...defaultProps} />)

      const firstSubtask = screen.getByTestId('subtask-1')
      firstSubtask.focus()

      await user.keyboard('{Delete}')

      expect(defaultProps.onDelete).toHaveBeenCalledWith('1')

      confirmSpy.mockRestore()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SubtaskManager {...defaultProps} />)

      expect(screen.getByRole('list')).toHaveAccessibleName('Subtasks')
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(screen.getByLabelText('Mark First subtask as complete')).toBeInTheDocument()
    })

    it('should announce progress changes to screen readers', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      const checkbox = screen.getByLabelText('Mark First subtask as complete')
      await user.click(checkbox)

      expect(screen.getByRole('status')).toHaveTextContent(
        '2 of 3 subtasks completed'
      )
    })

    it('should provide context for screen readers', () => {
      render(<SubtaskManager {...defaultProps} />)

      expect(screen.getByLabelText('Subtask manager for parent todo')).toBeInTheDocument()
    })

    it('should support keyboard-only interaction', async () => {
      const user = userEvent.setup()
      
      render(<SubtaskManager {...defaultProps} />)

      // Should be able to navigate through all interactive elements
      await user.tab()
      expect(screen.getByLabelText('Mark First subtask as complete')).toHaveFocus()
      
      await user.tab()
      expect(screen.getByTestId('subtask-1')).toHaveFocus()
    })
  })

  describe('Performance', () => {
    it('should virtualize large subtask lists', () => {
      const manySubtasks = Array.from({ length: 1000 }, (_, i) => 
        createMockSubtask({ id: `${i}`, title: `Subtask ${i}` })
      )
      
      render(<SubtaskManager {...defaultProps} subtasks={manySubtasks} />)

      // Should only render visible items (mocked to return limited items)
      expect(screen.getAllByTestId(/^subtask-/)).toHaveLength(10)
    })

    it('should memoize subtask items', () => {
      const renderSpy = vi.fn()
      
      const SubtaskItemWithSpy = (props: any) => {
        renderSpy()
        return <div {...props} />
      }

      const { rerender } = render(
        <SubtaskManager {...defaultProps} SubtaskItem={SubtaskItemWithSpy} />
      )

      expect(renderSpy).toHaveBeenCalledTimes(3) // Once per subtask

      // Re-render with same props
      rerender(<SubtaskManager {...defaultProps} SubtaskItem={SubtaskItemWithSpy} />)

      // Should be memoized
      expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should debounce search input', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      
      render(<SubtaskManager {...defaultProps} onSearch={onSearch} searchable />)

      const searchInput = screen.getByPlaceholderText('Search subtasks...')
      await user.type(searchInput, 'test')

      // Should debounce the search
      expect(onSearch).not.toHaveBeenCalled()

      await waitFor(() => {
        expect(onSearch).toHaveBeenCalledWith('test')
      }, { timeout: 500 })
    })
  })

  describe('Error Handling', () => {
    it('should handle add operation errors', async () => {
      const user = userEvent.setup()
      const failingOnAdd = vi.fn().mockRejectedValue(new Error('Add failed'))
      
      render(<SubtaskManager {...defaultProps} onAdd={failingOnAdd} />)

      await user.click(screen.getByRole('button', { name: /add subtask/i }))
      
      const input = screen.getByPlaceholderText('Add a subtask...')
      await user.type(input, 'New subtask')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to add subtask')
      })
    })

    it('should handle update operation errors', async () => {
      const user = userEvent.setup()
      const failingOnUpdate = vi.fn().mockRejectedValue(new Error('Update failed'))
      
      render(<SubtaskManager {...defaultProps} onUpdate={failingOnUpdate} />)

      await user.click(screen.getByText('First subtask'))
      
      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'Updated title')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to update subtask')
      })
    })

    it('should handle network errors gracefully', () => {
      render(
        <SubtaskManager 
          {...defaultProps} 
          error="Network error: Unable to sync subtasks"
        />
      )

      expect(screen.getByRole('alert')).toHaveTextContent('Network error: Unable to sync subtasks')
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('should handle malformed subtask data', () => {
      const malformedSubtasks = [
        { id: '1' }, // Missing required fields
        { id: '2', title: '', completed: null }, // Invalid values
      ]
      
      render(<SubtaskManager {...defaultProps} subtasks={malformedSubtasks as any} />)

      // Should render without crashing
      expect(screen.getByTestId('subtask-manager')).toBeInTheDocument()
    })
  })
})