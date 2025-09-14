import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoForm } from '../TodoForm'
import { render, createMockTodo, createMockUser } from '../../test/utils/test-utils'

// Mock the LLM integration service
vi.mock('../../services/llm.service', () => ({
  LLMService: {
    analyzeTodo: vi.fn(),
    suggestContext: vi.fn(),
    breakDownTask: vi.fn(),
    clarifyOutcome: vi.fn(),
  },
}))

// Mock the context suggestions
vi.mock('../ContextSuggestions', () => ({
  ContextSuggestions: ({ onSelect, loading, suggestions }: any) => (
    <div data-testid="context-suggestions">
      {loading ? (
        <div>Loading suggestions...</div>
      ) : (
        <div>
          {suggestions?.map((suggestion: string) => (
            <button 
              key={suggestion} 
              onClick={() => onSelect(suggestion)}
              data-testid={`suggestion-${suggestion}`}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  ),
}))

describe('TodoForm Component', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()
  const mockOnLLMAnalysis = vi.fn()
  
  const defaultProps = {
    onSubmit: mockOnSubmit,
    onCancel: mockOnCancel,
    onLLMAnalysis: mockOnLLMAnalysis,
    isLoading: false,
    mode: 'create' as const,
    user: createMockUser(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Create Mode', () => {
    it('should render empty form for new todos', () => {
      render(<TodoForm {...defaultProps} />)

      expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('')
      expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('')
      expect(screen.getByRole('textbox', { name: /outcome/i })).toHaveValue('')
      expect(screen.getByRole('textbox', { name: /next action/i })).toHaveValue('')
      expect(screen.getByText('Create Todo')).toBeInTheDocument()
    })

    it('should validate required fields', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /create todo/i }))

      expect(screen.getByText('Title is required')).toBeInTheDocument()
    })

    it('should validate GTD best practices', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.type(titleInput, 'Vague task')

      await user.click(screen.getByRole('button', { name: /create todo/i }))

      expect(screen.getByText('Consider adding a clear outcome')).toBeInTheDocument()
      expect(screen.getByText('What is the specific next physical action?')).toBeInTheDocument()
    })

    it('should suggest contexts based on title and description', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      const descriptionInput = screen.getByRole('textbox', { name: /description/i })

      await user.type(titleInput, 'Call client about project')
      await user.type(descriptionInput, 'Discuss requirements and timeline')

      // Should show context suggestions
      await waitFor(() => {
        expect(screen.getByTestId('context-suggestions')).toBeInTheDocument()
      })
    })

    it('should create todo with valid data', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Complete project proposal')
      await user.type(screen.getByRole('textbox', { name: /description/i }), 'Detailed project proposal for client')
      await user.type(screen.getByRole('textbox', { name: /outcome/i }), 'Approved proposal ready for implementation')
      await user.type(screen.getByRole('textbox', { name: /next action/i }), 'Draft executive summary section')

      const prioritySelect = screen.getByLabelText(/priority/i)
      await user.selectOptions(prioritySelect, 'high')

      const energySelect = screen.getByLabelText(/energy level/i)
      await user.selectOptions(energySelect, 'high')

      await user.type(screen.getByLabelText(/estimated time/i), '120')

      await user.click(screen.getByRole('button', { name: /create todo/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        title: 'Complete project proposal',
        description: 'Detailed project proposal for client',
        outcome: 'Approved proposal ready for implementation',
        nextAction: 'Draft executive summary section',
        priority: 'high',
        energy: 'high',
        estimatedMinutes: 120,
        status: 'inbox',
        context: [],
        tags: [],
        project: '',
        dueDate: null,
      })
    })

    it('should handle project selection', async () => {
      const user = userEvent.setup()
      const existingProjects = ['Website Redesign', 'Mobile App', 'Marketing Campaign']
      
      render(<TodoForm {...defaultProps} existingProjects={existingProjects} />)

      const projectInput = screen.getByLabelText(/project/i)
      await user.click(projectInput)

      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
      expect(screen.getByText('Mobile App')).toBeInTheDocument()

      await user.click(screen.getByText('Website Redesign'))

      expect(projectInput).toHaveValue('Website Redesign')
    })

    it('should allow creating new project', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const projectInput = screen.getByLabelText(/project/i)
      await user.type(projectInput, 'New Project Name')

      await user.click(screen.getByRole('button', { name: /create todo/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'New Project Name'
        })
      )
    })

    it('should handle due date selection', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const dueDateInput = screen.getByLabelText(/due date/i)
      await user.type(dueDateInput, '2024-12-31')

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Test Todo')
      await user.click(screen.getByRole('button', { name: /create todo/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: '2024-12-31T23:59:59.999Z'
        })
      )
    })
  })

  describe('Edit Mode', () => {
    const existingTodo = createMockTodo({
      title: 'Existing Todo',
      description: 'Existing description',
      outcome: 'Clear outcome',
      nextAction: 'Specific next action',
      priority: 'medium',
      energy: 'high',
      estimatedMinutes: 60,
      project: 'Test Project',
      context: ['@computer', '@calls'],
      tags: ['urgent', 'work'],
    })

    it('should populate form with existing todo data', () => {
      render(<TodoForm {...defaultProps} mode="edit" todo={existingTodo} />)

      expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Existing Todo')
      expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Existing description')
      expect(screen.getByRole('textbox', { name: /outcome/i })).toHaveValue('Clear outcome')
      expect(screen.getByRole('textbox', { name: /next action/i })).toHaveValue('Specific next action')
      expect(screen.getByLabelText(/priority/i)).toHaveValue('medium')
      expect(screen.getByLabelText(/energy level/i)).toHaveValue('high')
      expect(screen.getByText('Update Todo')).toBeInTheDocument()
    })

    it('should show existing contexts and tags', () => {
      render(<TodoForm {...defaultProps} mode="edit" todo={existingTodo} />)

      expect(screen.getByText('@computer')).toBeInTheDocument()
      expect(screen.getByText('@calls')).toBeInTheDocument()
      expect(screen.getByText('urgent')).toBeInTheDocument()
      expect(screen.getByText('work')).toBeInTheDocument()
    })

    it('should update existing todo', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} mode="edit" todo={existingTodo} />)

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Todo Title')

      await user.click(screen.getByRole('button', { name: /update todo/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Todo Title'
        })
      )
    })

    it('should preserve unchanged fields', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} mode="edit" todo={existingTodo} />)

      // Only change the title
      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.clear(titleInput)
      await user.type(titleInput, 'New Title')

      await user.click(screen.getByRole('button', { name: /update todo/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Title',
          description: 'Existing description', // Preserved
          outcome: 'Clear outcome', // Preserved
        })
      )
    })
  })

  describe('Context Management', () => {
    it('should add context tags', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const contextInput = screen.getByPlaceholderText(/add context/i)
      await user.type(contextInput, '@office')
      await user.keyboard('{Enter}')

      expect(screen.getByText('@office')).toBeInTheDocument()
    })

    it('should remove context tags', async () => {
      const user = userEvent.setup()
      const todoWithContext = createMockTodo({ context: ['@computer'] })
      
      render(<TodoForm {...defaultProps} mode="edit" todo={todoWithContext} />)

      expect(screen.getByText('@computer')).toBeInTheDocument()

      await user.click(screen.getByLabelText('Remove @computer'))

      expect(screen.queryByText('@computer')).not.toBeInTheDocument()
    })

    it('should validate context format', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const contextInput = screen.getByPlaceholderText(/add context/i)
      await user.type(contextInput, 'invalid-context')
      await user.keyboard('{Enter}')

      expect(screen.getByText('Context should start with @')).toBeInTheDocument()
    })

    it('should suggest common contexts', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const contextInput = screen.getByPlaceholderText(/add context/i)
      await user.click(contextInput)

      expect(screen.getByText('@computer')).toBeInTheDocument()
      expect(screen.getByText('@calls')).toBeInTheDocument()
      expect(screen.getByText('@errands')).toBeInTheDocument()
      expect(screen.getByText('@office')).toBeInTheDocument()
    })

    it('should filter context suggestions based on input', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const contextInput = screen.getByPlaceholderText(/add context/i)
      await user.type(contextInput, '@c')

      expect(screen.getByText('@computer')).toBeInTheDocument()
      expect(screen.getByText('@calls')).toBeInTheDocument()
      expect(screen.queryByText('@errands')).not.toBeInTheDocument()
    })
  })

  describe('Tag Management', () => {
    it('should add tags', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const tagInput = screen.getByPlaceholderText(/add tag/i)
      await user.type(tagInput, 'urgent')
      await user.keyboard('{Enter}')

      expect(screen.getByText('urgent')).toBeInTheDocument()
    })

    it('should remove tags', async () => {
      const user = userEvent.setup()
      const todoWithTags = createMockTodo({ tags: ['urgent'] })
      
      render(<TodoForm {...defaultProps} mode="edit" todo={todoWithTags} />)

      await user.click(screen.getByLabelText('Remove urgent tag'))

      expect(screen.queryByText('urgent')).not.toBeInTheDocument()
    })

    it('should suggest existing tags', async () => {
      const user = userEvent.setup()
      const existingTags = ['work', 'personal', 'urgent', 'low-priority']
      
      render(<TodoForm {...defaultProps} existingTags={existingTags} />)

      const tagInput = screen.getByPlaceholderText(/add tag/i)
      await user.click(tagInput)

      expect(screen.getByText('work')).toBeInTheDocument()
      expect(screen.getByText('personal')).toBeInTheDocument()
    })
  })

  describe('LLM Integration', () => {
    it('should analyze todo and suggest improvements', async () => {
      const user = userEvent.setup()
      const { LLMService } = await import('../../services/llm.service')
      
      LLMService.analyzeTodo.mockResolvedValue({
        suggestions: [
          { type: 'outcome', text: 'Define what success looks like' },
          { type: 'nextAction', text: 'Break down into specific action' },
          { type: 'context', text: 'Add appropriate context' },
        ],
        confidence: 0.8,
      })
      
      render(<TodoForm {...defaultProps} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Improve website')

      await user.click(screen.getByText('Analyze with AI'))

      await waitFor(() => {
        expect(screen.getByText('AI Suggestions')).toBeInTheDocument()
      })

      expect(screen.getByText('Define what success looks like')).toBeInTheDocument()
      expect(screen.getByText('Break down into specific action')).toBeInTheDocument()
    })

    it('should suggest contexts based on content', async () => {
      const user = userEvent.setup()
      const { LLMService } = await import('../../services/llm.service')
      
      LLMService.suggestContext.mockResolvedValue(['@computer', '@online'])
      
      render(<TodoForm {...defaultProps} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Update website content')
      await user.type(screen.getByRole('textbox', { name: /description/i }), 'Need to update the homepage copy')

      await waitFor(() => {
        expect(screen.getByTestId('suggestion-@computer')).toBeInTheDocument()
        expect(screen.getByTestId('suggestion-@online')).toBeInTheDocument()
      })
    })

    it('should break down complex tasks into subtasks', async () => {
      const user = userEvent.setup()
      const { LLMService } = await import('../../services/llm.service')
      
      LLMService.breakDownTask.mockResolvedValue([
        'Research design trends',
        'Create wireframes',
        'Design mockups',
        'Get feedback from stakeholders',
        'Implement final design',
      ])
      
      render(<TodoForm {...defaultProps} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Redesign website')

      await user.click(screen.getByText('Break Down Task'))

      await waitFor(() => {
        expect(screen.getByText('Suggested Subtasks:')).toBeInTheDocument()
      })

      expect(screen.getByText('Research design trends')).toBeInTheDocument()
      expect(screen.getByText('Create wireframes')).toBeInTheDocument()
    })

    it('should clarify vague outcomes', async () => {
      const user = userEvent.setup()
      const { LLMService } = await import('../../services/llm.service')
      
      LLMService.clarifyOutcome.mockResolvedValue(
        'A fully functional website with improved user experience, faster loading times, and mobile responsiveness'
      )
      
      render(<TodoForm {...defaultProps} />)

      await user.type(screen.getByRole('textbox', { name: /outcome/i }), 'Better website')

      await user.click(screen.getByText('Clarify Outcome'))

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /outcome/i })).toHaveValue(
          'A fully functional website with improved user experience, faster loading times, and mobile responsiveness'
        )
      })
    })

    it('should handle LLM service errors', async () => {
      const user = userEvent.setup()
      const { LLMService } = await import('../../services/llm.service')
      
      LLMService.analyzeTodo.mockRejectedValue(new Error('LLM service unavailable'))
      
      render(<TodoForm {...defaultProps} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Test todo')
      await user.click(screen.getByText('Analyze with AI'))

      await waitFor(() => {
        expect(screen.getByText('AI analysis temporarily unavailable')).toBeInTheDocument()
      })
    })
  })

  describe('Form Validation', () => {
    it('should show GTD-specific validation hints', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.type(titleInput, 'Do something')
      await user.tab() // Trigger blur

      expect(screen.getByText('Consider being more specific. What exactly needs to be done?')).toBeInTheDocument()
    })

    it('should validate next action is actionable', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const nextActionInput = screen.getByRole('textbox', { name: /next action/i })
      await user.type(nextActionInput, 'Think about the project')
      await user.tab()

      expect(screen.getByText('Next action should be a specific physical action you can take')).toBeInTheDocument()
    })

    it('should suggest outcome improvements', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const outcomeInput = screen.getByRole('textbox', { name: /outcome/i })
      await user.type(outcomeInput, 'Done')
      await user.tab()

      expect(screen.getByText('What does "done" look like? Be more specific about the desired result.')).toBeInTheDocument()
    })

    it('should validate estimated time is reasonable', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const timeInput = screen.getByLabelText(/estimated time/i)
      await user.type(timeInput, '10000') // 10000 minutes = ~166 hours
      await user.tab()

      expect(screen.getByText('Consider breaking this into smaller tasks (recommended: < 4 hours)')).toBeInTheDocument()
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('should save with Ctrl+S', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Test Todo')
      await user.keyboard('{Control>}s{/Control}')

      expect(mockOnSubmit).toHaveBeenCalled()
    })

    it('should cancel with Escape', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      await user.keyboard('{Escape}')

      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('should navigate between fields with Tab', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      titleInput.focus()

      await user.tab()
      expect(screen.getByRole('textbox', { name: /description/i })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('textbox', { name: /outcome/i })).toHaveFocus()
    })
  })

  describe('Auto-save', () => {
    it('should auto-save draft after typing stops', async () => {
      const user = userEvent.setup()
      const onAutoSave = vi.fn()
      
      render(<TodoForm {...defaultProps} onAutoSave={onAutoSave} />)

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.type(titleInput, 'Auto-saved todo')

      await waitFor(() => {
        expect(onAutoSave).toHaveBeenCalled()
      }, { timeout: 1000 })
    })

    it('should show auto-save indicator', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} autoSaveEnabled={true} />)

      const titleInput = screen.getByRole('textbox', { name: /title/i })
      await user.type(titleInput, 'Test')

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument()
      }, { timeout: 1000 })
    })

    it('should restore from draft on reload', () => {
      const draftData = {
        title: 'Draft Todo',
        description: 'Draft description',
      }
      
      render(<TodoForm {...defaultProps} draftData={draftData} />)

      expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Draft Todo')
      expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Draft description')
      expect(screen.getByText('Draft restored')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<TodoForm {...defaultProps} />)

      expect(screen.getByLabelText('Title *')).toBeInTheDocument()
      expect(screen.getByLabelText('Description')).toBeInTheDocument()
      expect(screen.getByLabelText('Desired Outcome')).toBeInTheDocument()
      expect(screen.getByLabelText('Next Physical Action')).toBeInTheDocument()
    })

    it('should announce validation errors to screen readers', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /create todo/i }))

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} />)

      // Should be able to navigate through all form fields
      await user.tab()
      expect(screen.getByRole('textbox', { name: /title/i })).toHaveFocus()
    })

    it('should provide context for GTD fields', () => {
      render(<TodoForm {...defaultProps} />)

      expect(screen.getByText(/what does success look like/i)).toBeInTheDocument()
      expect(screen.getByText(/specific physical action/i)).toBeInTheDocument()
    })
  })

  describe('Responsive Design', () => {
    it('should adapt layout for mobile', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })
      
      render(<TodoForm {...defaultProps} />)

      expect(screen.getByTestId('todo-form')).toHaveClass('mobile-layout')
    })

    it('should stack fields vertically on small screens', () => {
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

      render(<TodoForm {...defaultProps} />)

      expect(screen.getByTestId('form-fields')).toHaveClass('vertical-stack')
    })
  })

  describe('Error Handling', () => {
    it('should handle submission errors gracefully', async () => {
      const user = userEvent.setup()
      const failingOnSubmit = vi.fn().mockRejectedValue(new Error('Submission failed'))
      
      render(<TodoForm {...defaultProps} onSubmit={failingOnSubmit} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Test Todo')
      await user.click(screen.getByRole('button', { name: /create todo/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to save todo')
      })

      // Form should remain populated
      expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Test Todo')
    })

    it('should show loading state during submission', async () => {
      const user = userEvent.setup()
      
      render(<TodoForm {...defaultProps} isLoading={true} />)

      const submitButton = screen.getByRole('button', { name: /create todo/i })
      expect(submitButton).toBeDisabled()
      expect(screen.getByText('Creating...')).toBeInTheDocument()
    })

    it('should prevent double submission', async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: any) => void
      const slowOnSubmit = vi.fn(() => new Promise(resolve => {
        resolvePromise = resolve
      }))
      
      render(<TodoForm {...defaultProps} onSubmit={slowOnSubmit} />)

      await user.type(screen.getByRole('textbox', { name: /title/i }), 'Test Todo')
      
      const submitButton = screen.getByRole('button', { name: /create todo/i })
      
      // Click submit multiple times rapidly
      await user.click(submitButton)
      await user.click(submitButton)
      await user.click(submitButton)

      expect(slowOnSubmit).toHaveBeenCalledTimes(1)

      // Resolve the promise to clean up
      resolvePromise!({})
    })
  })
})