import React, { useState, useCallback } from 'react'
import { GTDSubtask } from '../test/utils/test-utils'

export interface SubtaskManagerProps {
  todoId: string
  subtasks: GTDSubtask[]
  onUpdate?: (action: string, data: any) => void
  editable?: boolean
  maxSubtasks?: number
  className?: string
}

export const SubtaskManager: React.FC<SubtaskManagerProps> = ({
  todoId,
  subtasks = [],
  onUpdate,
  editable = true,
  maxSubtasks = 20,
  className = '',
}) => {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const handleAddSubtask = useCallback(() => {
    const title = newSubtaskTitle.trim()
    if (!title) return

    if (subtasks.length >= maxSubtasks) {
      alert(`Maximum ${maxSubtasks} subtasks allowed`)
      return
    }

    onUpdate?.('add', {
      title,
      completed: false,
      todoId,
    })

    setNewSubtaskTitle('')
    setIsAdding(false)
  }, [newSubtaskTitle, subtasks.length, maxSubtasks, onUpdate, todoId])

  const handleToggleSubtask = useCallback((subtaskId: string, completed: boolean) => {
    onUpdate?.('toggle', {
      subtaskId,
      completed,
      todoId,
    })
  }, [onUpdate, todoId])

  const handleEditSubtask = useCallback((subtaskId: string, title: string) => {
    setEditingSubtaskId(subtaskId)
    setEditingTitle(title)
  }, [])

  const handleSaveEdit = useCallback((subtaskId: string) => {
    const title = editingTitle.trim()
    if (!title) {
      handleCancelEdit()
      return
    }

    onUpdate?.('edit', {
      subtaskId,
      title,
      todoId,
    })

    setEditingSubtaskId(null)
    setEditingTitle('')
  }, [editingTitle, onUpdate, todoId])

  const handleCancelEdit = useCallback(() => {
    setEditingSubtaskId(null)
    setEditingTitle('')
  }, [])

  const handleDeleteSubtask = useCallback((subtaskId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this subtask?')
    if (!confirmed) return

    onUpdate?.('delete', {
      subtaskId,
      todoId,
    })
  }, [onUpdate, todoId])

  const handleKeyPress = useCallback((e: React.KeyboardEvent, action: 'add' | 'edit', subtaskId?: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (action === 'add') {
        handleAddSubtask()
      } else if (action === 'edit' && subtaskId) {
        handleSaveEdit(subtaskId)
      }
    } else if (e.key === 'Escape') {
      if (action === 'add') {
        setNewSubtaskTitle('')
        setIsAdding(false)
      } else if (action === 'edit') {
        handleCancelEdit()
      }
    }
  }, [handleAddSubtask, handleSaveEdit, handleCancelEdit])

  const completedCount = subtasks.filter(s => s.completed).length
  const totalCount = subtasks.length
  const completionPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  return (
    <div data-testid="subtask-manager" className={`subtask-manager ${className}`}>
      <div className="subtask-header">
        <h4 className="subtask-title">Subtasks</h4>
        <div className="subtask-stats">
          <span data-testid="subtask-count">
            {totalCount} subtask{totalCount !== 1 ? 's' : ''}
          </span>
          {totalCount > 0 && (
            <span className="subtask-completion">
              ({completedCount} completed)
            </span>
          )}
        </div>
      </div>

      {totalCount > 0 && (
        <div className="subtask-progress">
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <span className="progress-text">
            {Math.round(completionPercentage)}% complete
          </span>
        </div>
      )}

      <div className="subtask-list">
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className={`subtask-item ${subtask.completed ? 'completed' : ''}`}
            data-testid={`subtask-${subtask.id}`}
          >
            <input
              type="checkbox"
              checked={subtask.completed}
              onChange={(e) => handleToggleSubtask(subtask.id, e.target.checked)}
              className="subtask-checkbox"
              aria-label={`Mark "${subtask.title}" as ${subtask.completed ? 'incomplete' : 'complete'}`}
            />

            {editingSubtaskId === subtask.id ? (
              <div className="subtask-edit-form">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => handleKeyPress(e, 'edit', subtask.id)}
                  className="subtask-edit-input"
                  autoFocus
                  maxLength={100}
                />
                <div className="subtask-edit-actions">
                  <button
                    onClick={() => handleSaveEdit(subtask.id)}
                    className="subtask-save-button"
                    title="Save changes"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="subtask-cancel-button"
                    title="Cancel editing"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span
                  className="subtask-title"
                  onClick={() => editable && handleEditSubtask(subtask.id, subtask.title)}
                  title={editable ? 'Click to edit' : undefined}
                >
                  {subtask.title}
                </span>

                {subtask.description && (
                  <span className="subtask-description">
                    {subtask.description}
                  </span>
                )}

                {editable && (
                  <div className="subtask-actions">
                    <button
                      onClick={() => handleEditSubtask(subtask.id, subtask.title)}
                      className="subtask-action-button edit-button"
                      aria-label={`Edit "${subtask.title}"`}
                      title="Edit subtask"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteSubtask(subtask.id)}
                      className="subtask-action-button delete-button"
                      aria-label={`Delete "${subtask.title}"`}
                      title="Delete subtask"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </>
            )}

            {subtask.estimatedMinutes && (
              <span className="subtask-time-estimate">
                {subtask.estimatedMinutes}m
              </span>
            )}

            {subtask.actualMinutes && (
              <span className="subtask-time-actual">
                ({subtask.actualMinutes}m actual)
              </span>
            )}
          </div>
        ))}
      </div>

      {editable && onUpdate && (
        <div className="subtask-add-section">
          {isAdding ? (
            <div className="subtask-add-form">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, 'add')}
                placeholder="Enter subtask title..."
                className="subtask-add-input"
                autoFocus
                maxLength={100}
              />
              <div className="subtask-add-actions">
                <button
                  onClick={handleAddSubtask}
                  className="subtask-add-save-button"
                  disabled={!newSubtaskTitle.trim()}
                  title="Add subtask"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setNewSubtaskTitle('')
                    setIsAdding(false)
                  }}
                  className="subtask-add-cancel-button"
                  title="Cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="subtask-add-button"
              disabled={subtasks.length >= maxSubtasks}
              aria-label="Add new subtask"
            >
              + Add Subtask
            </button>
          )}

          {subtasks.length >= maxSubtasks && (
            <p className="subtask-limit-message">
              Maximum {maxSubtasks} subtasks reached
            </p>
          )}
        </div>
      )}

      {totalCount === 0 && !isAdding && (
        <div className="subtask-empty">
          <p className="empty-message">No subtasks yet</p>
          {editable && onUpdate && (
            <button
              onClick={() => setIsAdding(true)}
              className="subtask-add-button-empty"
            >
              Add your first subtask
            </button>
          )}
        </div>
      )}
    </div>
  )
}