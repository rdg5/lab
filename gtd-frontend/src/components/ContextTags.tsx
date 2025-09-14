import React, { useState, useCallback } from 'react'

export interface ContextTagsProps {
  contexts: string[]
  onAdd?: (context: string) => void
  onRemove?: (context: string) => void
  editable?: boolean
  maxTags?: number
  placeholder?: string
  className?: string
}

export const ContextTags: React.FC<ContextTagsProps> = ({
  contexts = [],
  onAdd,
  onRemove,
  editable = true,
  maxTags = 10,
  placeholder = "Add context (e.g., @calls, @computer)",
  className = '',
}) => {
  const [newContext, setNewContext] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const handleAddContext = useCallback(() => {
    const trimmedContext = newContext.trim()
    
    if (!trimmedContext) return
    
    // Ensure context starts with @
    const contextWithAt = trimmedContext.startsWith('@') 
      ? trimmedContext 
      : `@${trimmedContext}`
    
    // Check if context already exists
    if (contexts.includes(contextWithAt)) {
      setNewContext('')
      return
    }
    
    // Check max tags limit
    if (contexts.length >= maxTags) {
      return
    }
    
    onAdd?.(contextWithAt)
    setNewContext('')
    setIsAdding(false)
  }, [newContext, contexts, onAdd, maxTags])

  const handleRemoveContext = useCallback((context: string) => {
    onRemove?.(context)
  }, [onRemove])

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddContext()
    } else if (e.key === 'Escape') {
      setNewContext('')
      setIsAdding(false)
    }
  }, [handleAddContext])

  const startAdding = useCallback(() => {
    setIsAdding(true)
  }, [])

  const cancelAdding = useCallback(() => {
    setNewContext('')
    setIsAdding(false)
  }, [])

  return (
    <div data-testid="context-tags" className={`context-tags ${className}`}>
      <div className="context-tags-label">
        <span>Contexts:</span>
        {editable && contexts.length < maxTags && (
          <span className="context-count">
            {contexts.length}/{maxTags}
          </span>
        )}
      </div>
      
      <div className="context-tags-list">
        {contexts.map((context) => (
          <span
            key={context}
            data-testid={`context-${context}`}
            className="context-tag"
          >
            <span className="context-text">{context}</span>
            {editable && onRemove && (
              <button
                onClick={() => handleRemoveContext(context)}
                className="context-remove-button"
                aria-label={`Remove ${context} context`}
                title={`Remove ${context}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        
        {editable && onAdd && (
          <>
            {isAdding ? (
              <div className="context-add-form">
                <input
                  type="text"
                  value={newContext}
                  onChange={(e) => setNewContext(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onBlur={cancelAdding}
                  placeholder={placeholder}
                  className="context-input"
                  autoFocus
                  maxLength={20}
                />
              </div>
            ) : contexts.length < maxTags ? (
              <button
                onClick={startAdding}
                className="context-add-button"
                aria-label="Add new context"
                title="Add new context"
              >
                + Add Context
              </button>
            ) : null}
          </>
        )}
      </div>
      
      {contexts.length === 0 && !isAdding && (
        <div className="context-tags-empty">
          <span className="empty-message">No contexts assigned</span>
          {editable && onAdd && (
            <button
              onClick={startAdding}
              className="context-add-button-empty"
            >
              Add your first context
            </button>
          )}
        </div>
      )}
      
      <div className="context-tags-help">
        <small>
          Contexts help you organize tasks by where or how they can be done 
          (e.g., @computer, @calls, @errands)
        </small>
      </div>
    </div>
  )
}