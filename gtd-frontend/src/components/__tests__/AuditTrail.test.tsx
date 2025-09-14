import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditTrail } from '../AuditTrail'
import { render, createMockTodo } from '../../test/utils/test-utils'

// Mock LLM transformation data
const createMockLLMTransformation = (overrides = {}) => ({
  id: '1',
  todoId: 'todo-1',
  type: 'clarify',
  input: 'Do something with the website',
  output: 'Update the homepage content with new product information',
  timestamp: '2024-01-01T12:00:00Z',
  model: 'gpt-4',
  confidence: 0.85,
  userFeedback: null,
  applied: true,
  ...overrides,
})

const createMockAuditEntry = (overrides = {}) => ({
  id: '1',
  todoId: 'todo-1',
  timestamp: '2024-01-01T12:00:00Z',
  type: 'llm_transformation',
  action: 'clarify_outcome',
  user: {
    id: 'user-1',
    name: 'John Doe',
    avatar: 'https://example.com/avatar.jpg',
  },
  changes: {
    before: 'Do something with the website',
    after: 'Update the homepage content with new product information',
  },
  metadata: {
    model: 'gpt-4',
    confidence: 0.85,
    processingTime: 1250, // ms
  },
  ...overrides,
})

// Mock LLM service
vi.mock('../../services/llm.service', () => ({
  LLMService: {
    getTransformationHistory: vi.fn(),
    provideFeedback: vi.fn(),
    revertTransformation: vi.fn(),
    explainTransformation: vi.fn(),
  },
}))

describe('AuditTrail Component', () => {
  const mockTransformations = [
    createMockLLMTransformation({
      id: '1',
      type: 'clarify',
      input: 'Fix the thing',
      output: 'Debug and resolve the login authentication issue',
      timestamp: '2024-01-01T12:00:00Z',
      confidence: 0.9,
    }),
    createMockLLMTransformation({
      id: '2',
      type: 'break_down',
      input: 'Launch marketing campaign',
      output: 'Create email templates, set up automation, schedule social posts',
      timestamp: '2024-01-01T11:00:00Z',
      confidence: 0.75,
    }),
    createMockLLMTransformation({
      id: '3',
      type: 'suggest_context',
      input: 'Review quarterly reports',
      output: 'Suggested contexts: @computer, @office, @high-focus',
      timestamp: '2024-01-01T10:00:00Z',
      confidence: 0.8,
      applied: false,
    }),
  ]

  const defaultProps = {
    todoId: 'todo-1',
    transformations: mockTransformations,
    onProvideFeedback: vi.fn(),
    onRevert: vi.fn(),
    onApply: vi.fn(),
    onExplain: vi.fn(),
    showTimeline: true,
    groupByType: false,
    maxItems: 50,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render all transformations', () => {
      render(<AuditTrail {...defaultProps} />)

      expect(screen.getByText('Debug and resolve the login authentication issue')).toBeInTheDocument()
      expect(screen.getByText('Create email templates, set up automation, schedule social posts')).toBeInTheDocument()
      expect(screen.getByText('Suggested contexts: @computer, @office, @high-focus')).toBeInTheDocument()
    })

    it('should show transformation types with icons', () => {
      render(<AuditTrail {...defaultProps} />)

      expect(screen.getByTestId('transformation-clarify')).toBeInTheDocument()
      expect(screen.getByTestId('transformation-break_down')).toBeInTheDocument()
      expect(screen.getByTestId('transformation-suggest_context')).toBeInTheDocument()
    })

    it('should display timestamps in chronological order', () => {
      render(<AuditTrail {...defaultProps} />)

      const timestamps = screen.getAllByTestId('transformation-timestamp')
      expect(timestamps[0]).toHaveTextContent('12:00 PM')
      expect(timestamps[1]).toHaveTextContent('11:00 AM')
      expect(timestamps[2]).toHaveTextContent('10:00 AM')
    })

    it('should show confidence scores', () => {
      render(<AuditTrail {...defaultProps} />)

      expect(screen.getByText('90% confidence')).toBeInTheDocument()
      expect(screen.getByText('75% confidence')).toBeInTheDocument()
      expect(screen.getByText('80% confidence')).toBeInTheDocument()
    })

    it('should indicate applied vs unapplied transformations', () => {
      render(<AuditTrail {...defaultProps} />)

      const appliedItems = screen.getAllByTestId('transformation-applied')
      const unappliedItems = screen.getAllByTestId('transformation-unapplied')
      
      expect(appliedItems).toHaveLength(2)
      expect(unappliedItems).toHaveLength(1)
    })

    it('should show empty state when no transformations', () => {
      render(<AuditTrail {...defaultProps} transformations={[]} />)

      expect(screen.getByText('No LLM transformations yet')).toBeInTheDocument()
      expect(screen.getByText('AI suggestions and improvements will appear here')).toBeInTheDocument()
    })
  })

  describe('Transformation Types', () => {
    it('should display clarify transformations correctly', () => {
      const clarifyTransform = createMockLLMTransformation({
        type: 'clarify',
        input: 'Work on project',
        output: 'Complete the user authentication module for the mobile app',
      })

      render(<AuditTrail {...defaultProps} transformations={[clarifyTransform]} />)

      expect(screen.getByText('Clarify')).toBeInTheDocument()
      expect(screen.getByText('Work on project')).toBeInTheDocument()
      expect(screen.getByText('Complete the user authentication module for the mobile app')).toBeInTheDocument()
    })

    it('should display break down transformations correctly', () => {
      const breakDownTransform = createMockLLMTransformation({
        type: 'break_down',
        input: 'Redesign website',
        output: '1. Audit current design\n2. Create wireframes\n3. Design mockups\n4. Implement changes',
      })

      render(<AuditTrail {...defaultProps} transformations={[breakDownTransform]} />)

      expect(screen.getByText('Break Down')).toBeInTheDocument()
      expect(screen.getByText('Redesign website')).toBeInTheDocument()
      expect(screen.getByText('1. Audit current design')).toBeInTheDocument()
    })

    it('should display context suggestions correctly', () => {
      const contextTransform = createMockLLMTransformation({
        type: 'suggest_context',
        input: 'Call client about proposal',
        output: '@calls, @agenda-meetings, @high-priority',
      })

      render(<AuditTrail {...defaultProps} transformations={[contextTransform]} />)

      expect(screen.getByText('Context Suggestion')).toBeInTheDocument()
      expect(screen.getByText('@calls')).toBeInTheDocument()
      expect(screen.getByText('@agenda-meetings')).toBeInTheDocument()
      expect(screen.getByText('@high-priority')).toBeInTheDocument()
    })

    it('should display optimization transformations correctly', () => {
      const optimizeTransform = createMockLLMTransformation({
        type: 'optimize',
        input: 'Write blog post about new features',
        output: 'Create comprehensive blog post highlighting 5 new features with screenshots, user testimonials, and clear CTAs',
      })

      render(<AuditTrail {...defaultProps} transformations={[optimizeTransform]} />)

      expect(screen.getByText('Optimize')).toBeInTheDocument()
      expect(screen.getByText(/comprehensive blog post/)).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should provide feedback on transformations', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const thumbsUpButton = screen.getAllByLabelText('Mark as helpful')[0]
      await user.click(thumbsUpButton)

      expect(defaultProps.onProvideFeedback).toHaveBeenCalledWith('1', 'positive')
    })

    it('should allow negative feedback', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const thumbsDownButton = screen.getAllByLabelText('Mark as not helpful')[0]
      await user.click(thumbsDownButton)

      expect(defaultProps.onProvideFeedback).toHaveBeenCalledWith('1', 'negative')
    })

    it('should revert applied transformations', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      render(<AuditTrail {...defaultProps} />)

      const revertButton = screen.getAllByText('Revert')[0]
      await user.click(revertButton)

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to revert this transformation?'
      )
      expect(defaultProps.onRevert).toHaveBeenCalledWith('1')

      confirmSpy.mockRestore()
    })

    it('should apply unapplied transformations', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const applyButton = screen.getByText('Apply')
      await user.click(applyButton)

      expect(defaultProps.onApply).toHaveBeenCalledWith('3')
    })

    it('should explain transformations', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const explainButton = screen.getAllByText('Explain')[0]
      await user.click(explainButton)

      expect(defaultProps.onExplain).toHaveBeenCalledWith('1')
    })

    it('should expand/collapse transformation details', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const transformationItem = screen.getByTestId('transformation-1')
      
      // Details should be collapsed by default
      expect(screen.queryByText('Model: gpt-4')).not.toBeVisible()
      
      await user.click(transformationItem)
      
      // Details should be expanded
      expect(screen.getByText('Model: gpt-4')).toBeVisible()
      expect(screen.getByText('90% confidence')).toBeVisible()
    })
  })

  describe('Filtering and Grouping', () => {
    it('should filter by transformation type', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const filterSelect = screen.getByLabelText('Filter by type')
      await user.selectOptions(filterSelect, 'clarify')

      expect(screen.getByText('Debug and resolve the login authentication issue')).toBeInTheDocument()
      expect(screen.queryByText('Create email templates')).not.toBeInTheDocument()
    })

    it('should filter by applied status', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const filterSelect = screen.getByLabelText('Filter by status')
      await user.selectOptions(filterSelect, 'applied')

      expect(screen.getAllByTestId(/^transformation-/)).toHaveLength(2)
    })

    it('should group transformations by type', () => {
      render(<AuditTrail {...defaultProps} groupByType={true} />)

      expect(screen.getByText('Clarify (1)')).toBeInTheDocument()
      expect(screen.getByText('Break Down (1)')).toBeInTheDocument()
      expect(screen.getByText('Context Suggestions (1)')).toBeInTheDocument()
    })

    it('should sort by confidence score', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort by')
      await user.selectOptions(sortSelect, 'confidence')

      const transformations = screen.getAllByTestId(/^transformation-/)
      expect(within(transformations[0]).getByText('90% confidence')).toBeInTheDocument()
      expect(within(transformations[1]).getByText('80% confidence')).toBeInTheDocument()
      expect(within(transformations[2]).getByText('75% confidence')).toBeInTheDocument()
    })

    it('should sort by date', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const sortSelect = screen.getByLabelText('Sort by')
      await user.selectOptions(sortSelect, 'date-desc')

      const timestamps = screen.getAllByTestId('transformation-timestamp')
      expect(timestamps[0]).toHaveTextContent('12:00 PM')
      expect(timestamps[1]).toHaveTextContent('11:00 AM')
      expect(timestamps[2]).toHaveTextContent('10:00 AM')
    })
  })

  describe('Timeline View', () => {
    it('should show timeline when enabled', () => {
      render(<AuditTrail {...defaultProps} showTimeline={true} />)

      expect(screen.getByTestId('transformation-timeline')).toBeInTheDocument()
      expect(screen.getAllByTestId('timeline-item')).toHaveLength(3)
    })

    it('should hide timeline when disabled', () => {
      render(<AuditTrail {...defaultProps} showTimeline={false} />)

      expect(screen.queryByTestId('transformation-timeline')).not.toBeInTheDocument()
    })

    it('should group timeline items by date', () => {
      const multiDayTransformations = [
        createMockLLMTransformation({
          id: '1',
          timestamp: '2024-01-01T12:00:00Z',
        }),
        createMockLLMTransformation({
          id: '2',
          timestamp: '2024-01-02T10:00:00Z',
        }),
      ]

      render(
        <AuditTrail 
          {...defaultProps} 
          transformations={multiDayTransformations}
          showTimeline={true}
        />
      )

      expect(screen.getByText('January 1, 2024')).toBeInTheDocument()
      expect(screen.getByText('January 2, 2024')).toBeInTheDocument()
    })

    it('should show transformation flow in timeline', () => {
      render(<AuditTrail {...defaultProps} showTimeline={true} />)

      const timeline = screen.getByTestId('transformation-timeline')
      const connections = within(timeline).getAllByTestId('timeline-connection')
      
      expect(connections).toHaveLength(2) // n-1 connections for n items
    })
  })

  describe('Model Information and Performance', () => {
    it('should display model information', () => {
      render(<AuditTrail {...defaultProps} />)

      const detailsButton = screen.getAllByLabelText('View details')[0]
      fireEvent.click(detailsButton)

      expect(screen.getByText('Model: gpt-4')).toBeInTheDocument()
      expect(screen.getByText('Processing time: 1.2s')).toBeInTheDocument()
    })

    it('should show confidence score with visual indicator', () => {
      render(<AuditTrail {...defaultProps} />)

      const confidenceBar = screen.getAllByTestId('confidence-bar')[0]
      expect(confidenceBar).toHaveStyle('width: 90%')
      expect(confidenceBar).toHaveClass('confidence-high')
    })

    it('should highlight low confidence transformations', () => {
      const lowConfidenceTransform = createMockLLMTransformation({
        confidence: 0.4,
      })

      render(<AuditTrail {...defaultProps} transformations={[lowConfidenceTransform]} />)

      expect(screen.getByTestId('transformation-1')).toHaveClass('low-confidence')
      expect(screen.getByText('40% confidence')).toHaveClass('confidence-warning')
    })

    it('should show processing time for each transformation', () => {
      render(<AuditTrail {...defaultProps} />)

      const detailsButton = screen.getAllByLabelText('View details')[0]
      fireEvent.click(detailsButton)

      expect(screen.getByText('Processing time: 1.2s')).toBeInTheDocument()
    })

    it('should display token usage information', () => {
      const transformWithTokens = createMockLLMTransformation({
        metadata: {
          tokensUsed: 150,
          tokensInput: 50,
          tokensOutput: 100,
        },
      })

      render(<AuditTrail {...defaultProps} transformations={[transformWithTokens]} />)

      const detailsButton = screen.getByLabelText('View details')
      fireEvent.click(detailsButton)

      expect(screen.getByText('Tokens: 150 (50 in, 100 out)')).toBeInTheDocument()
    })
  })

  describe('Feedback and Learning', () => {
    it('should show feedback summary', () => {
      const transformWithFeedback = createMockLLMTransformation({
        userFeedback: 'positive',
        feedbackComment: 'Very helpful clarification',
      })

      render(<AuditTrail {...defaultProps} transformations={[transformWithFeedback]} />)

      expect(screen.getByTestId('feedback-positive')).toBeInTheDocument()
      expect(screen.getByText('Very helpful clarification')).toBeInTheDocument()
    })

    it('should allow adding feedback comments', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const feedbackButton = screen.getAllByLabelText('Add feedback')[0]
      await user.click(feedbackButton)

      const commentInput = screen.getByPlaceholderText('Add your feedback...')
      await user.type(commentInput, 'This was very helpful')

      const submitButton = screen.getByText('Submit Feedback')
      await user.click(submitButton)

      expect(defaultProps.onProvideFeedback).toHaveBeenCalledWith(
        '1',
        'positive',
        'This was very helpful'
      )
    })

    it('should show aggregated feedback stats', () => {
      render(<AuditTrail {...defaultProps} showStats={true} />)

      expect(screen.getByText('Feedback Summary')).toBeInTheDocument()
      expect(screen.getByText('85% helpful rate')).toBeInTheDocument()
      expect(screen.getByText('Most useful: Context Suggestions')).toBeInTheDocument()
    })

    it('should suggest improvements based on feedback', () => {
      render(<AuditTrail {...defaultProps} showSuggestions={true} />)

      expect(screen.getByText('Suggestions for better results:')).toBeInTheDocument()
      expect(screen.getByText('Be more specific in your initial task description')).toBeInTheDocument()
    })
  })

  describe('Export and Sharing', () => {
    it('should export transformation history', async () => {
      const user = userEvent.setup()
      const mockWriteText = vi.fn()
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true
      })
      
      render(<AuditTrail {...defaultProps} />)

      const exportButton = screen.getByText('Export')
      await user.click(exportButton)

      expect(mockWriteText).toHaveBeenCalled()
      expect(screen.getByText('History exported to clipboard')).toBeInTheDocument()
    })

    it('should share specific transformations', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const shareButton = screen.getAllByLabelText('Share transformation')[0]
      await user.click(shareButton)

      expect(screen.getByText('Share Transformation')).toBeInTheDocument()
      expect(screen.getByText('Copy Link')).toBeInTheDocument()
    })

    it('should generate transformation reports', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const reportButton = screen.getByText('Generate Report')
      await user.click(reportButton)

      expect(screen.getByText('Transformation Report')).toBeInTheDocument()
      expect(screen.getByText('Download PDF')).toBeInTheDocument()
    })
  })

  describe('Search and Navigation', () => {
    it('should search through transformation content', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('Search transformations...')
      await user.type(searchInput, 'login')

      expect(screen.getByText(/Debug and resolve the login/)).toBeInTheDocument()
      expect(screen.queryByText(/marketing campaign/)).not.toBeInTheDocument()
    })

    it('should highlight search results', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText('Search transformations...')
      await user.type(searchInput, 'authentication')

      const highlightedText = screen.getByTestId('search-highlight')
      expect(highlightedText).toHaveTextContent('authentication')
      expect(highlightedText).toHaveClass('highlight')
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const firstTransformation = screen.getByTestId('transformation-1')
      firstTransformation.focus()

      await user.keyboard('{ArrowDown}')
      expect(screen.getByTestId('transformation-2')).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(screen.getByText('Model: gpt-4')).toBeVisible()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<AuditTrail {...defaultProps} />)

      expect(screen.getByRole('list')).toHaveAccessibleName('LLM transformation history')
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    it('should announce transformation updates to screen readers', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      const applyButton = screen.getByText('Apply')
      await user.click(applyButton)

      expect(screen.getByRole('status')).toHaveTextContent('Transformation applied')
    })

    it('should provide context for screen readers', () => {
      render(<AuditTrail {...defaultProps} />)

      const transformation = screen.getByTestId('transformation-1')
      expect(transformation).toHaveAccessibleDescription(
        'Clarification transformation with 90% confidence, applied'
      )
    })

    it('should support keyboard-only interaction', async () => {
      const user = userEvent.setup()
      
      render(<AuditTrail {...defaultProps} />)

      // Should be able to navigate through all interactive elements
      await user.tab()
      expect(screen.getByLabelText('Filter by type')).toHaveFocus()
      
      await user.tab()
      expect(screen.getAllByLabelText('Mark as helpful')[0]).toHaveFocus()
    })
  })

  describe('Performance', () => {
    it('should virtualize large transformation lists', () => {
      const manyTransformations = Array.from({ length: 1000 }, (_, i) => 
        createMockLLMTransformation({ id: `${i}` })
      )
      
      render(<AuditTrail {...defaultProps} transformations={manyTransformations} />)

      // Should only render visible items
      expect(screen.getAllByTestId(/^transformation-/)).toHaveLength(10)
    })

    it('should implement pagination for large datasets', () => {
      const manyTransformations = Array.from({ length: 100 }, (_, i) => 
        createMockLLMTransformation({ id: `${i}` })
      )
      
      render(<AuditTrail {...defaultProps} transformations={manyTransformations} />)

      expect(screen.getByText('Showing 1-50 of 100')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
    })

    it('should lazy load transformation details', async () => {
      const user = userEvent.setup()
      const loadDetailsSpy = vi.fn()
      
      render(<AuditTrail {...defaultProps} onLoadDetails={loadDetailsSpy} />)

      const transformationItem = screen.getByTestId('transformation-1')
      await user.click(transformationItem)

      expect(loadDetailsSpy).toHaveBeenCalledWith('1')
    })

    it('should debounce search input', async () => {
      const user = userEvent.setup()
      const searchSpy = vi.fn()
      
      render(<AuditTrail {...defaultProps} onSearch={searchSpy} />)

      const searchInput = screen.getByPlaceholderText('Search transformations...')
      await user.type(searchInput, 'test')

      // Should debounce the search
      expect(searchSpy).not.toHaveBeenCalled()

      await waitFor(() => {
        expect(searchSpy).toHaveBeenCalledWith('test')
      }, { timeout: 500 })
    })
  })

  describe('Error Handling', () => {
    it('should handle loading errors gracefully', () => {
      render(
        <AuditTrail 
          {...defaultProps} 
          error="Failed to load transformation history"
        />
      )

      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load transformation history')
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('should handle network errors during feedback submission', async () => {
      const user = userEvent.setup()
      const failingFeedback = vi.fn().mockRejectedValue(new Error('Network error'))
      
      render(<AuditTrail {...defaultProps} onProvideFeedback={failingFeedback} />)

      const thumbsUpButton = screen.getAllByLabelText('Mark as helpful')[0]
      await user.click(thumbsUpButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to submit feedback')).toBeInTheDocument()
      })
    })

    it('should handle malformed transformation data', () => {
      const malformedTransformations = [
        { id: '1' }, // Missing required fields
        { id: '2', type: null, input: '', output: null },
      ]
      
      render(<AuditTrail {...defaultProps} transformations={malformedTransformations as any} />)

      // Should render without crashing
      expect(screen.getByTestId('audit-trail')).toBeInTheDocument()
    })
  })
})