import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextTags } from '../ContextTags'
import { render } from '../../test/utils/test-utils'

describe('ContextTags Component', () => {
  const defaultProps = {
    contexts: ['@computer', '@calls', '@errands'],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onChange: vi.fn(),
    suggestions: ['@office', '@home', '@online', '@phone'],
    isEditable: true,
    placeholder: 'Add context...',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render existing contexts', () => {
      render(<ContextTags {...defaultProps} />)

      expect(screen.getByText('@computer')).toBeInTheDocument()
      expect(screen.getByText('@calls')).toBeInTheDocument()
      expect(screen.getByText('@errands')).toBeInTheDocument()
    })

    it('should show add input when editable', () => {
      render(<ContextTags {...defaultProps} />)

      expect(screen.getByPlaceholderText('Add context...')).toBeInTheDocument()
    })

    it('should hide add input when not editable', () => {
      render(<ContextTags {...defaultProps} isEditable={false} />)

      expect(screen.queryByPlaceholderText('Add context...')).not.toBeInTheDocument()
    })

    it('should show remove buttons for each context when editable', () => {
      render(<ContextTags {...defaultProps} />)

      expect(screen.getByLabelText('Remove @computer context')).toBeInTheDocument()
      expect(screen.getByLabelText('Remove @calls context')).toBeInTheDocument()
      expect(screen.getByLabelText('Remove @errands context')).toBeInTheDocument()
    })

    it('should hide remove buttons when not editable', () => {
      render(<ContextTags {...defaultProps} isEditable={false} />)

      expect(screen.queryByLabelText('Remove @computer context')).not.toBeInTheDocument()
    })

    it('should show empty state when no contexts', () => {
      render(<ContextTags {...defaultProps} contexts={[]} />)

      expect(screen.getByText('No contexts added')).toBeInTheDocument()
      expect(screen.getByText('Add contexts to organize your todos by where or how they can be done')).toBeInTheDocument()
    })
  })

  describe('Adding Contexts', () => {
    it('should add context with Enter key', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@office')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).toHaveBeenCalledWith('@office')
    })

    it('should add context with comma', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@office,')

      expect(defaultProps.onAdd).toHaveBeenCalledWith('@office')
    })

    it('should add context with tab', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@office')
      await user.tab()

      expect(defaultProps.onAdd).toHaveBeenCalledWith('@office')
    })

    it('should auto-format context with @ prefix', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, 'office')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).toHaveBeenCalledWith('@office')
    })

    it('should clear input after adding context', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@office')
      await user.keyboard('{Enter}')

      expect(input).toHaveValue('')
    })

    it('should not add empty context', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).not.toHaveBeenCalled()
    })

    it('should not add duplicate context', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@computer')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).not.toHaveBeenCalled()
      expect(screen.getByText('Context already exists')).toBeInTheDocument()
    })

    it('should validate context format', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@invalid context with spaces')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).not.toHaveBeenCalled()
      expect(screen.getByText('Context cannot contain spaces')).toBeInTheDocument()
    })

    it('should limit context length', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      const longContext = '@' + 'a'.repeat(50)
      await user.type(input, longContext)
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).not.toHaveBeenCalled()
      expect(screen.getByText('Context too long (max 20 characters)')).toBeInTheDocument()
    })

    it('should support adding multiple contexts at once', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@office @home @online')
      await user.keyboard('{Enter}')

      expect(defaultProps.onAdd).toHaveBeenCalledWith('@office')
      expect(defaultProps.onAdd).toHaveBeenCalledWith('@home')
      expect(defaultProps.onAdd).toHaveBeenCalledWith('@online')
    })
  })

  describe('Removing Contexts', () => {
    it('should remove context when remove button is clicked', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      await user.click(screen.getByLabelText('Remove @computer context'))

      expect(defaultProps.onRemove).toHaveBeenCalledWith('@computer')
    })

    it('should remove context with backspace when input is empty', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      input.focus()
      await user.keyboard('{Backspace}')

      expect(defaultProps.onRemove).toHaveBeenCalledWith('@errands') // Last context
    })

    it('should confirm removal for important contexts', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      render(<ContextTags {...defaultProps} />)

      await user.click(screen.getByLabelText('Remove @computer context'))

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to remove the @computer context?'
      )
      expect(defaultProps.onRemove).toHaveBeenCalledWith('@computer')

      confirmSpy.mockRestore()
    })

    it('should not remove when confirmation is cancelled', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      
      render(<ContextTags {...defaultProps} />)

      await user.click(screen.getByLabelText('Remove @computer context'))

      expect(defaultProps.onRemove).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })
  })

  describe('Context Suggestions', () => {
    it('should show suggestions when input is focused', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      expect(screen.getByText('@office')).toBeInTheDocument()
      expect(screen.getByText('@home')).toBeInTheDocument()
      expect(screen.getByText('@online')).toBeInTheDocument()
      expect(screen.getByText('@phone')).toBeInTheDocument()
    })

    it('should filter suggestions based on input', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@o')

      expect(screen.getByText('@office')).toBeInTheDocument()
      expect(screen.getByText('@online')).toBeInTheDocument()
      expect(screen.queryByText('@home')).not.toBeInTheDocument()
      expect(screen.queryByText('@phone')).not.toBeInTheDocument()
    })

    it('should add suggestion when clicked', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      await user.click(screen.getByText('@office'))

      expect(defaultProps.onAdd).toHaveBeenCalledWith('@office')
    })

    it('should hide suggestions when input loses focus', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      expect(screen.getByText('@office')).toBeInTheDocument()

      await user.tab()

      expect(screen.queryByText('@office')).not.toBeInTheDocument()
    })

    it('should navigate suggestions with arrow keys', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      await user.keyboard('{ArrowDown}')
      expect(screen.getByText('@office')).toHaveClass('highlighted')

      await user.keyboard('{ArrowDown}')
      expect(screen.getByText('@home')).toHaveClass('highlighted')

      await user.keyboard('{Enter}')
      expect(defaultProps.onAdd).toHaveBeenCalledWith('@home')
    })

    it('should show common GTD contexts', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} suggestions={[]} showCommonContexts />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      expect(screen.getByText('@computer')).toBeInTheDocument()
      expect(screen.getByText('@calls')).toBeInTheDocument()
      expect(screen.getByText('@errands')).toBeInTheDocument()
      expect(screen.getByText('@waiting')).toBeInTheDocument()
      expect(screen.getByText('@agenda')).toBeInTheDocument()
    })

    it('should exclude existing contexts from suggestions', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      // @computer is already in contexts, so should not appear in suggestions
      expect(screen.queryByText('@computer')).not.toBeInTheDocument()
      expect(screen.getByText('@office')).toBeInTheDocument()
    })
  })

  describe('Context Colors and Categories', () => {
    it('should apply color coding to contexts', () => {
      const contextsWithColors = [
        { name: '@computer', color: 'blue' },
        { name: '@calls', color: 'green' },
        { name: '@errands', color: 'yellow' },
      ]
      
      render(<ContextTags {...defaultProps} contexts={contextsWithColors} />)

      expect(screen.getByText('@computer')).toHaveClass('context-blue')
      expect(screen.getByText('@calls')).toHaveClass('context-green')
      expect(screen.getByText('@errands')).toHaveClass('context-yellow')
    })

    it('should group contexts by category', () => {
      const categorizedContexts = [
        { name: '@computer', category: 'work' },
        { name: '@calls', category: 'communication' },
        { name: '@home', category: 'personal' },
      ]
      
      render(
        <ContextTags 
          {...defaultProps} 
          contexts={categorizedContexts}
          showCategories
        />
      )

      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('Communication')).toBeInTheDocument()
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    it('should allow custom context colors', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} allowColorPicker />)

      const contextTag = screen.getByText('@computer')
      await user.rightClick(contextTag)

      expect(screen.getByText('Change Color')).toBeInTheDocument()
    })
  })

  describe('Drag and Drop', () => {
    it('should support reordering contexts', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} sortable />)

      const computerContext = screen.getByText('@computer')
      const callsContext = screen.getByText('@calls')

      // Simulate drag and drop
      fireEvent.dragStart(computerContext)
      fireEvent.drop(callsContext)

      expect(defaultProps.onChange).toHaveBeenCalledWith([
        '@calls',
        '@computer', 
        '@errands'
      ])
    })

    it('should show drag handle when sortable', () => {
      render(<ContextTags {...defaultProps} sortable />)

      expect(screen.getAllByTestId('drag-handle')).toHaveLength(3)
    })

    it('should disable drag when not editable', () => {
      render(<ContextTags {...defaultProps} sortable isEditable={false} />)

      expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument()
    })
  })

  describe('Context Statistics', () => {
    it('should show context usage count', () => {
      const contextsWithCounts = [
        { name: '@computer', count: 15 },
        { name: '@calls', count: 8 },
        { name: '@errands', count: 3 },
      ]
      
      render(<ContextTags {...defaultProps} contexts={contextsWithCounts} showCounts />)

      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('should show context popularity indicator', () => {
      const popularContexts = [
        { name: '@computer', popularity: 'high' },
        { name: '@calls', popularity: 'medium' },
        { name: '@errands', popularity: 'low' },
      ]
      
      render(<ContextTags {...defaultProps} contexts={popularContexts} showPopularity />)

      expect(screen.getByTestId('popularity-high')).toBeInTheDocument()
      expect(screen.getByTestId('popularity-medium')).toBeInTheDocument()
      expect(screen.getByTestId('popularity-low')).toBeInTheDocument()
    })

    it('should suggest trending contexts', async () => {
      const user = userEvent.setup()
      const trendingContexts = ['@remote', '@video-call', '@slack']
      
      render(
        <ContextTags 
          {...defaultProps} 
          trendingContexts={trendingContexts}
        />
      )

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      expect(screen.getByText('Trending:')).toBeInTheDocument()
      expect(screen.getByText('@remote')).toBeInTheDocument()
      expect(screen.getByText('@video-call')).toBeInTheDocument()
    })
  })

  describe('Context Validation and Smart Features', () => {
    it('should validate context against GTD best practices', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@maybe-someday')
      await user.keyboard('{Enter}')

      expect(screen.getByText('Consider using standard GTD contexts')).toBeInTheDocument()
    })

    it('should suggest context based on time and location', async () => {
      const user = userEvent.setup()
      
      // Mock geolocation and time
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => success({
          coords: { latitude: 37.7749, longitude: -122.4194 }
        }))
      }
      Object.defineProperty(global.navigator, 'geolocation', {
        value: mockGeolocation,
        writable: true
      })
      
      render(<ContextTags {...defaultProps} smartSuggestions />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.click(input)

      await waitFor(() => {
        expect(screen.getByText('Smart suggestions:')).toBeInTheDocument()
      })
    })

    it('should warn about conflicting contexts', async () => {
      const user = userEvent.setup()
      const contextsWithConflicts = ['@computer', '@offline']
      
      render(<ContextTags {...defaultProps} contexts={contextsWithConflicts} />)

      expect(screen.getByText('⚠️ Conflicting contexts detected')).toBeInTheDocument()
      expect(screen.getByText('@computer and @offline may conflict')).toBeInTheDocument()
    })

    it('should suggest context combinations', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@calls')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Often paired with: @phone, @agenda')).toBeInTheDocument()
      })
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support keyboard navigation between contexts', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const firstContext = screen.getByText('@computer')
      firstContext.focus()

      await user.keyboard('{ArrowRight}')

      expect(screen.getByText('@calls')).toHaveFocus()
    })

    it('should delete context with Delete key when focused', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const firstContext = screen.getByText('@computer')
      firstContext.focus()

      await user.keyboard('{Delete}')

      expect(defaultProps.onRemove).toHaveBeenCalledWith('@computer')
    })

    it('should select all contexts with Ctrl+A', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} multiSelect />)

      await user.keyboard('{Control>}a{/Control}')

      expect(screen.getByText('3 contexts selected')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ContextTags {...defaultProps} />)

      expect(screen.getByRole('list')).toHaveAccessibleName('Context tags')
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(screen.getByLabelText('Add new context')).toBeInTheDocument()
    })

    it('should announce context changes to screen readers', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@office')
      await user.keyboard('{Enter}')

      expect(screen.getByRole('status')).toHaveTextContent('Added context @office')
    })

    it('should provide context descriptions for screen readers', () => {
      const contextsWithDescriptions = [
        { name: '@computer', description: 'Tasks requiring a computer' },
        { name: '@calls', description: 'Phone calls to make' },
      ]
      
      render(<ContextTags {...defaultProps} contexts={contextsWithDescriptions} />)

      expect(screen.getByLabelText('@computer - Tasks requiring a computer')).toBeInTheDocument()
      expect(screen.getByLabelText('@calls - Phone calls to make')).toBeInTheDocument()
    })

    it('should support high contrast mode', () => {
      // Mock high contrast media query
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

      render(<ContextTags {...defaultProps} />)

      expect(screen.getByTestId('context-tags')).toHaveClass('high-contrast')
    })
  })

  describe('Import/Export', () => {
    it('should support importing contexts from text', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      await user.click(screen.getByText('Import'))

      const textarea = screen.getByPlaceholderText('Paste contexts here...')
      await user.type(textarea, '@office\n@home\n@travel')
      
      await user.click(screen.getByText('Import Contexts'))

      expect(defaultProps.onAdd).toHaveBeenCalledWith('@office')
      expect(defaultProps.onAdd).toHaveBeenCalledWith('@home')
      expect(defaultProps.onAdd).toHaveBeenCalledWith('@travel')
    })

    it('should support exporting contexts', async () => {
      const user = userEvent.setup()
      const mockWriteText = vi.fn()
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true
      })
      
      render(<ContextTags {...defaultProps} />)

      await user.click(screen.getByText('Export'))

      expect(mockWriteText).toHaveBeenCalledWith('@computer\n@calls\n@errands')
      expect(screen.getByText('Contexts copied to clipboard')).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should memoize context rendering', () => {
      const renderSpy = vi.fn()
      
      const ContextTagWithSpy = (props: any) => {
        renderSpy()
        return <span {...props} />
      }

      const { rerender } = render(
        <ContextTags {...defaultProps} ContextTag={ContextTagWithSpy} />
      )

      expect(renderSpy).toHaveBeenCalledTimes(3) // Once per context

      // Re-render with same props
      rerender(<ContextTags {...defaultProps} ContextTag={ContextTagWithSpy} />)

      // Should be memoized
      expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should virtualize large context lists', () => {
      const manyContexts = Array.from({ length: 1000 }, (_, i) => `@context${i}`)
      
      render(<ContextTags {...defaultProps} contexts={manyContexts} virtualized />)

      // Should only render visible items
      expect(screen.getAllByRole('listitem')).toHaveLength(10) // Mocked virtualized list
    })

    it('should debounce search suggestions', async () => {
      const user = userEvent.setup()
      const onSearchSuggestions = vi.fn()
      
      render(
        <ContextTags 
          {...defaultProps} 
          onSearchSuggestions={onSearchSuggestions}
        />
      )

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, 'test')

      // Should debounce the search
      expect(onSearchSuggestions).not.toHaveBeenCalled()

      await waitFor(() => {
        expect(onSearchSuggestions).toHaveBeenCalledWith('test')
      }, { timeout: 500 })
    })
  })

  describe('Error Handling', () => {
    it('should handle add operation errors', async () => {
      const user = userEvent.setup()
      const failingOnAdd = vi.fn().mockRejectedValue(new Error('Add failed'))
      
      render(<ContextTags {...defaultProps} onAdd={failingOnAdd} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@office')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to add context')
      })
    })

    it('should handle invalid context characters', async () => {
      const user = userEvent.setup()
      
      render(<ContextTags {...defaultProps} />)

      const input = screen.getByPlaceholderText('Add context...')
      await user.type(input, '@context-with-special-chars!@#')
      await user.keyboard('{Enter}')

      expect(screen.getByText('Context contains invalid characters')).toBeInTheDocument()
    })

    it('should handle network errors gracefully', () => {
      render(
        <ContextTags 
          {...defaultProps} 
          error="Network error: Unable to sync contexts"
        />
      )

      expect(screen.getByRole('alert')).toHaveTextContent('Network error: Unable to sync contexts')
    })
  })
})