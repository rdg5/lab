import React, { useState, useCallback, useEffect, memo, useRef } from 'react'
import { format } from 'date-fns'
import { GTDTodo } from '../test/utils/test-utils'
import { ContextTags } from './ContextTags'
import { SubtaskManager } from './SubtaskManager'

export interface TodoItemProps {
  todo: GTDTodo
  onUpdate: (id: string, updates: Partial<GTDTodo>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onStatusChange: (id: string, status: GTDTodo['status']) => void | Promise<void>
  onContextChange: (id: string, action: 'add' | 'remove', context: string) => void
  isSelected?: boolean
  showSubtasks?: boolean
  className?: string
}

interface EditFormData {
  title: string
  description: string
  outcome: string
  nextAction: string
  project: string
  priority: 'low' | 'medium' | 'high'
  energy: 'low' | 'medium' | 'high'
  estimatedMinutes?: number
  dueDate?: string
}

export const TodoItem = memo(function TodoItem({
  todo,
  onUpdate,
  onDelete,
  onStatusChange,
  onContextChange,
  isSelected = false,
  showSubtasks = true,
  className = '',
}: TodoItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [isMobile, setIsMobile] = useState(false)
  
  const titleInputRef = useRef<HTMLInputElement>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout>()

  // Form state for editing
  const [formData, setFormData] = useState<EditFormData>({
    title: todo.title,
    description: todo.description || '',
    outcome: todo.outcome || '',
    nextAction: todo.nextAction || '',
    project: todo.project || '',
    priority: todo.priority,
    energy: todo.energy,
    estimatedMinutes: todo.estimatedMinutes,
    dueDate: todo.dueDate ? (() => {
      try {
        const date = new Date(todo.dueDate)
        return isNaN(date.getTime()) ? '' : format(date, "yyyy-MM-dd'T'HH:mm")
      } catch {
        return ''
      }
    })() : '',
  })

  // Check if mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Focus on title input when entering edit mode
  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [isEditing])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target === e.currentTarget && e.key === 'Enter') {
        setIsExpanded(prev => !prev)
      }
    }

    const todoElement = document.querySelector(`[data-testid="todo-item-${todo.id}"]`)
    if (todoElement) {
      todoElement.addEventListener('keydown', handleKeyDown)
      return () => todoElement.removeEventListener('keydown', handleKeyDown)
    }
  }, [todo.id])

  const handleToggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev)
  }, [])

  const handleStatusToggle = useCallback(async () => {
    try {
      const newStatus = todo.status === 'completed' ? 'inbox' : 'completed'
      await onStatusChange(todo.id, newStatus)
      
      setStatusMessage(
        newStatus === 'completed' ? 'Todo marked as complete' : 'Todo marked as incomplete'
      )
      
      // Clear message after 3 seconds
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (err) {
      setError('Failed to update status')
    }
  }, [todo.id, todo.status, onStatusChange])

  const handleEdit = useCallback(() => {
    setIsEditing(true)
    setError(null)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setFormData({
      title: todo.title,
      description: todo.description || '',
      outcome: todo.outcome || '',
      nextAction: todo.nextAction || '',
      project: todo.project || '',
      priority: todo.priority,
      energy: todo.energy,
      estimatedMinutes: todo.estimatedMinutes,
      dueDate: todo.dueDate ? (() => {
      try {
        const date = new Date(todo.dueDate)
        return isNaN(date.getTime()) ? '' : format(date, "yyyy-MM-dd'T'HH:mm")
      } catch {
        return ''
      }
    })() : '',
    })
    setError(null)
  }, [todo])

  const handleSaveEdit = useCallback(async () => {
    try {
      setError(null)
      const updates: Partial<GTDTodo> = {
        title: formData.title,
        description: formData.description || undefined,
        outcome: formData.outcome || undefined,
        nextAction: formData.nextAction || undefined,
        project: formData.project || undefined,
        priority: formData.priority,
        energy: formData.energy,
        estimatedMinutes: formData.estimatedMinutes || undefined,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
      }

      await onUpdate(todo.id, updates)
      setIsEditing(false)
    } catch (err) {
      setError('Failed to update todo')
    }
  }, [formData, todo.id, onUpdate])

  // Debounced form update handler
  const handleFormChange = useCallback((field: keyof EditFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
    
    // Set new timeout for debounced save
    debounceTimeoutRef.current = setTimeout(() => {
      // Auto-save logic could go here for rapid edits
    }, 500)
  }, [])

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm('Are you sure you want to delete this todo?')
    if (!confirmed) return

    try {
      setIsDeleting(true)
      await onDelete(todo.id)
    } catch (err) {
      setError('Failed to delete todo')
      setIsDeleting(false)
    }
  }, [todo.id, onDelete])

  const handleContextAdd = useCallback((context: string) => {
    onContextChange(todo.id, 'add', context)
  }, [todo.id, onContextChange])

  const handleContextRemove = useCallback((context: string) => {
    onContextChange(todo.id, 'remove', context)
  }, [todo.id, onContextChange])

  const handleSubtaskUpdate = useCallback((action: string, subtaskData: any) => {
    // This would be handled by the SubtaskManager component
  }, [])

  // Format due date
  const formatDueDate = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return 'Invalid date'
      }
      return format(date, 'MMM dd, yyyy')
    } catch {
      return 'Invalid date'
    }
  }, [])

  const isOverdue = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString)
      return date < new Date() && todo.status !== 'completed'
    } catch {
      return false
    }
  }, [todo.status])

  // Calculate subtask progress
  const subtaskProgress = todo.subtasks ? {
    completed: todo.subtasks.filter(s => s.completed).length,
    total: todo.subtasks.length,
    percentage: todo.subtasks.length > 0 
      ? (todo.subtasks.filter(s => s.completed).length / todo.subtasks.length) * 100 
      : 0
  } : null

  const hasOfflineChanges = todo.offlineChanges && todo.offlineChanges.length > 0

  return (
    <div
      data-testid="todo-item"
      className={`
        todo-item 
        ${todo.status === 'completed' ? 'completed' : ''} 
        ${isSelected ? 'selected' : ''} 
        ${isMobile ? 'mobile-layout' : ''}
        ${className}
      `}
      tabIndex={0}
      role="article"
      aria-expanded={isExpanded}
    >
      {/* Status Message for Screen Readers */}
      {statusMessage && (
        <div role="status" aria-live="polite" className="sr-only">
          {statusMessage}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div role="alert" className="error-message">
          {error}
        </div>
      )}

      {/* Todo Header */}
      <div
        data-testid="todo-header"
        className="todo-header"
        onClick={handleToggleExpanded}
        role="button"
        tabIndex={0}
      >
        <div className="todo-main">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={todo.status === 'completed'}
            onChange={handleStatusToggle}
            onClick={(e) => e.stopPropagation()}
            aria-label="Mark as complete"
            className="todo-checkbox"
          />

          {/* Priority Indicator */}
          <div
            data-testid="priority-indicator"
            className={`priority-indicator priority-${todo.priority}`}
            aria-label={`Priority: ${todo.priority}`}
          />

          {/* Title and Basic Info */}
          <div className="todo-content">
            <h3 className="todo-title">{todo.title}</h3>
            
            {isMobile && (
              <div data-testid="condensed-info" className="condensed-info">
                {todo.project && <span className="project-badge">{todo.project}</span>}
                {todo.dueDate && (
                  <span className={`due-date ${isOverdue(todo.dueDate) ? 'overdue' : ''}`}>
                    {formatDueDate(todo.dueDate)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div data-testid="status-badge" className={`status-badge status-${todo.status}`}>
            {todo.status}
          </div>

          {/* Sync Status */}
          <div
            data-testid="sync-status"
            className={`sync-status sync-${todo.syncStatus}`}
            title={`Sync status: ${todo.syncStatus}`}
          />

          {/* Offline Changes Indicator */}
          {hasOfflineChanges && (
            <div
              data-testid="offline-changes-indicator"
              className="offline-changes-indicator"
              title="Has offline changes"
            >
              ⏳
            </div>
          )}

          {/* Actions */}
          <div className="todo-actions">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleEdit()
              }}
              aria-label="Edit todo"
              className="action-button edit-button"
              disabled={isDeleting}
            >
              ✏️
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              aria-label="Delete todo"
              className="action-button delete-button"
              disabled={isDeleting}
            >
              🗑️
            </button>
          </div>
        </div>

        {/* Subtask Progress */}
        {subtaskProgress && subtaskProgress.total > 0 && (
          <div className="subtask-progress-container">
            <div data-testid="subtask-progress" className="subtask-progress-text">
              {subtaskProgress.completed}/{subtaskProgress.total}
            </div>
            <div className="progress-bar-container">
              <div
                data-testid="progress-bar"
                className="progress-bar"
                style={{ width: `${subtaskProgress.percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="todo-expanded">
          {!isEditing ? (
            <div className="todo-details">
              {/* Description */}
              {todo.description && (
                <div className="todo-description">{todo.description}</div>
              )}

              {/* GTD Fields */}
              {todo.outcome && (
                <div className="gtd-field">
                  <label>Outcome:</label>
                  <span>{todo.outcome}</span>
                </div>
              )}

              {todo.nextAction && (
                <div className="gtd-field">
                  <label>Next Action:</label>
                  <span>{todo.nextAction}</span>
                </div>
              )}

              {todo.project && (
                <div className="gtd-field">
                  <label>Project:</label>
                  <span>{todo.project}</span>
                </div>
              )}

              <div className="gtd-field">
                <label>Energy Level:</label>
                <span data-testid="energy-level">{todo.energy}</span>
              </div>

              {/* Time Information */}
              <div className="time-info">
                {todo.estimatedMinutes && (
                  <span className="time-estimate">Est: {todo.estimatedMinutes}m</span>
                )}
                {todo.actualMinutes && (
                  <span className="time-actual">Actual: {todo.actualMinutes}m</span>
                )}
              </div>

              {/* Due Date */}
              {todo.dueDate && !isMobile && (
                <div
                  data-testid="due-date"
                  className={`due-date ${isOverdue(todo.dueDate) ? 'overdue' : ''}`}
                >
                  Due: {formatDueDate(todo.dueDate)}
                </div>
              )}

              {/* Completion Info */}
              {todo.status === 'completed' && todo.completedAt && (
                <div className="completion-info">
                  Completed on {format(new Date(todo.completedAt), 'MMM dd, yyyy')}
                </div>
              )}

              {/* Context Tags */}
              <ContextTags
                contexts={todo.context || []}
                onAdd={handleContextAdd}
                onRemove={handleContextRemove}
              />

              {/* Subtasks */}
              {showSubtasks && todo.subtasks && todo.subtasks.length > 0 && (
                <SubtaskManager
                  todoId={todo.id}
                  subtasks={todo.subtasks}
                  onUpdate={handleSubtaskUpdate}
                />
              )}
            </div>
          ) : (
            // Edit Form
            <div className="todo-edit-form">
              <div className="form-row">
                <label htmlFor={`title-${todo.id}`}>Title:</label>
                <input
                  id={`title-${todo.id}`}
                  ref={titleInputRef}
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-row">
                <label htmlFor={`description-${todo.id}`}>Description:</label>
                <textarea
                  id={`description-${todo.id}`}
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  className="form-textarea"
                  rows={3}
                />
              </div>

              <div className="form-row">
                <label htmlFor={`outcome-${todo.id}`}>Outcome:</label>
                <input
                  id={`outcome-${todo.id}`}
                  type="text"
                  value={formData.outcome}
                  onChange={(e) => handleFormChange('outcome', e.target.value)}
                  className="form-input"
                  placeholder="What does success look like?"
                />
              </div>

              <div className="form-row">
                <label htmlFor={`nextAction-${todo.id}`}>Next Action:</label>
                <input
                  id={`nextAction-${todo.id}`}
                  type="text"
                  value={formData.nextAction}
                  onChange={(e) => handleFormChange('nextAction', e.target.value)}
                  className="form-input"
                  placeholder="What's the very next physical action?"
                />
              </div>

              <div className="form-row">
                <label htmlFor={`project-${todo.id}`}>Project:</label>
                <input
                  id={`project-${todo.id}`}
                  type="text"
                  value={formData.project}
                  onChange={(e) => handleFormChange('project', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-row-group">
                <div className="form-row">
                  <label htmlFor={`priority-${todo.id}`}>Priority:</label>
                  <select
                    id={`priority-${todo.id}`}
                    value={formData.priority}
                    onChange={(e) => handleFormChange('priority', e.target.value)}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-row">
                  <label htmlFor={`energy-${todo.id}`}>Energy:</label>
                  <select
                    id={`energy-${todo.id}`}
                    value={formData.energy}
                    onChange={(e) => handleFormChange('energy', e.target.value)}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="form-row-group">
                <div className="form-row">
                  <label htmlFor={`estimated-${todo.id}`}>Estimated Time (min):</label>
                  <input
                    id={`estimated-${todo.id}`}
                    type="number"
                    value={formData.estimatedMinutes || ''}
                    onChange={(e) => handleFormChange('estimatedMinutes', parseInt(e.target.value) || 0)}
                    className="form-input"
                    min="0"
                  />
                </div>

                <div className="form-row">
                  <label htmlFor={`dueDate-${todo.id}`}>Due Date:</label>
                  <input
                    id={`dueDate-${todo.id}`}
                    type="datetime-local"
                    value={formData.dueDate}
                    onChange={(e) => handleFormChange('dueDate', e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  onClick={handleSaveEdit}
                  className="save-button"
                  type="button"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="cancel-button"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})