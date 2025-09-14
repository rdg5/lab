import type { GTDQualityMetrics, GTDAnalysisResult, GTD_QUALITY_THRESHOLD } from '@/types/gtd';
import type { Todo, Subtask } from '@/types/database';
import { TRPCError } from '@trpc/server';

export class GTDEnforcementService {
  /**
   * Validates a todo against GTD principles
   */
  validateTodo(todo: Partial<Todo>): GTDQualityMetrics {
    const metrics: GTDQualityMetrics = {
      hasOutcome: this.hasValidOutcome(todo.outcome),
      hasNextAction: this.hasValidNextAction(todo.next_action),
      outcomeClarity: this.calculateOutcomeClarity(todo.outcome),
      actionSpecificity: this.calculateActionSpecificity(todo.next_action),
      contextRelevance: this.calculateContextRelevance(todo.context, todo.next_action),
      estimateAccuracy: this.calculateEstimateAccuracy(todo.time_estimate, todo.description),
      overallScore: 0, // Will be calculated
      suggestions: [],
    };

    // Calculate overall score
    metrics.overallScore = this.calculateOverallScore(metrics);

    // Generate suggestions
    metrics.suggestions = this.generateSuggestions(metrics, todo);

    return metrics;
  }

  /**
   * Validates a subtask against GTD principles
   */
  validateSubtask(subtask: Partial<Subtask>): GTDQualityMetrics {
    const metrics: GTDQualityMetrics = {
      hasOutcome: this.hasValidOutcome(subtask.outcome),
      hasNextAction: this.hasValidNextAction(subtask.next_action),
      outcomeClarity: this.calculateOutcomeClarity(subtask.outcome),
      actionSpecificity: this.calculateActionSpecificity(subtask.next_action),
      contextRelevance: 1.0, // Subtasks inherit context from parent
      estimateAccuracy: 0.8, // Subtasks typically don't have estimates
      overallScore: 0,
      suggestions: [],
    };

    metrics.overallScore = this.calculateOverallScore(metrics);
    metrics.suggestions = this.generateSubtaskSuggestions(metrics, subtask);

    return metrics;
  }

  /**
   * Enforces GTD quality threshold
   */
  enforceQualityThreshold(qualityScore: number): void {
    if (qualityScore < GTD_QUALITY_THRESHOLD) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Todo quality score ${qualityScore.toFixed(2)} is below the required threshold of ${GTD_QUALITY_THRESHOLD}. Please improve the outcome clarity and next action specificity.`,
      });
    }
  }

  /**
   * Checks if the todo meets GTD standards for completion
   */
  canComplete(todo: Todo, subtasks: Subtask[] = []): { canComplete: boolean; reason?: string } {
    // Check if all subtasks are completed
    const incompleteSubtasks = subtasks.filter(st => !st.completed);
    if (incompleteSubtasks.length > 0) {
      return {
        canComplete: false,
        reason: `Cannot complete todo: ${incompleteSubtasks.length} subtask(s) still incomplete`,
      };
    }

    // Check if todo has proper GTD structure
    const metrics = this.validateTodo(todo);
    if (!metrics.hasOutcome || !metrics.hasNextAction) {
      return {
        canComplete: false,
        reason: 'Cannot complete todo: Missing clear outcome or next action',
      };
    }

    return { canComplete: true };
  }

  /**
   * Re-evaluates todo quality after changes
   */
  reevaluateTodo(todo: Todo): { newQualityScore: number; needsImprovement: boolean; suggestions: string[] } {
    const metrics = this.validateTodo(todo);
    
    return {
      newQualityScore: metrics.overallScore,
      needsImprovement: metrics.overallScore < GTD_QUALITY_THRESHOLD,
      suggestions: metrics.suggestions,
    };
  }

  private hasValidOutcome(outcome?: string): boolean {
    return Boolean(outcome && outcome.trim().length > 10 && outcome.includes('Success looks like'));
  }

  private hasValidNextAction(nextAction?: string): boolean {
    return Boolean(nextAction && nextAction.trim().length > 5 && this.isActionVerb(nextAction));
  }

  private isActionVerb(action: string): boolean {
    const actionWords = [
      'call', 'email', 'write', 'create', 'review', 'schedule', 'book',
      'research', 'analyze', 'design', 'implement', 'test', 'deploy',
      'open', 'close', 'start', 'finish', 'complete', 'send', 'receive',
      'buy', 'order', 'install', 'configure', 'setup', 'download',
    ];
    
    const firstWord = action.trim().toLowerCase().split(' ')[0];
    return actionWords.includes(firstWord);
  }

  private calculateOutcomeClarity(outcome?: string): number {
    if (!outcome) return 0;

    let score = 0;
    const outcomeText = outcome.toLowerCase();

    // Check for GTD-style outcome statements
    if (outcomeText.includes('success looks like')) score += 0.3;
    if (outcomeText.includes('complete') || outcomeText.includes('finished')) score += 0.2;
    if (outcomeText.includes('deliverable') || outcomeText.includes('result')) score += 0.2;
    
    // Check for specificity
    if (outcome.length > 30) score += 0.1;
    if (outcome.length > 50) score += 0.1;
    
    // Check for measurable outcomes
    if (/\d+/.test(outcome)) score += 0.1; // Contains numbers
    
    return Math.min(score, 1.0);
  }

  private calculateActionSpecificity(nextAction?: string): number {
    if (!nextAction) return 0;

    let score = 0;
    const actionText = nextAction.toLowerCase();

    // Check for action verb at start
    if (this.isActionVerb(nextAction)) score += 0.4;

    // Check for specificity indicators
    if (actionText.includes('open') || actionText.includes('call') || actionText.includes('email')) score += 0.2;
    if (nextAction.length > 20) score += 0.1;
    if (nextAction.length > 40) score += 0.1;
    
    // Check for context clues
    if (actionText.includes('@') || actionText.includes('at ') || actionText.includes('in ')) score += 0.2;

    return Math.min(score, 1.0);
  }

  private calculateContextRelevance(context?: string, nextAction?: string): number {
    if (!context || !nextAction) return 0.5; // Neutral if missing

    const contextLower = context.toLowerCase();
    const actionLower = nextAction.toLowerCase();

    // Computer context
    if (contextLower.includes('@computer') || contextLower.includes('computer')) {
      if (actionLower.includes('open') || actionLower.includes('email') || 
          actionLower.includes('research') || actionLower.includes('write')) {
        return 1.0;
      }
    }

    // Phone context
    if (contextLower.includes('@phone') || contextLower.includes('phone')) {
      if (actionLower.includes('call') || actionLower.includes('phone')) {
        return 1.0;
      }
    }

    // Default relevance
    return 0.7;
  }

  private calculateEstimateAccuracy(timeEstimate?: number, description?: string): number {
    if (!timeEstimate) return 0.5; // Neutral if no estimate

    // Very rough heuristic based on description length and complexity
    if (description) {
      const wordCount = description.split(' ').length;
      if (wordCount > 50 && timeEstimate < 30) return 0.3; // Likely underestimated
      if (wordCount < 10 && timeEstimate > 120) return 0.4; // Likely overestimated
    }

    // Reasonable estimates get higher scores
    if (timeEstimate >= 15 && timeEstimate <= 240) return 0.8; // 15 min to 4 hours
    if (timeEstimate > 240) return 0.6; // Very long tasks might need breaking down

    return 0.7;
  }

  private calculateOverallScore(metrics: GTDQualityMetrics): number {
    const weights = {
      hasOutcome: 0.25,
      hasNextAction: 0.25,
      outcomeClarity: 0.2,
      actionSpecificity: 0.15,
      contextRelevance: 0.1,
      estimateAccuracy: 0.05,
    };

    return (
      (metrics.hasOutcome ? 1 : 0) * weights.hasOutcome +
      (metrics.hasNextAction ? 1 : 0) * weights.hasNextAction +
      metrics.outcomeClarity * weights.outcomeClarity +
      metrics.actionSpecificity * weights.actionSpecificity +
      metrics.contextRelevance * weights.contextRelevance +
      metrics.estimateAccuracy * weights.estimateAccuracy
    );
  }

  private generateSuggestions(metrics: GTDQualityMetrics, todo: Partial<Todo>): string[] {
    const suggestions: string[] = [];

    if (!metrics.hasOutcome || metrics.outcomeClarity < 0.7) {
      suggestions.push('Improve outcome clarity. Start with "Success looks like..." and be specific about what done means.');
    }

    if (!metrics.hasNextAction || metrics.actionSpecificity < 0.7) {
      suggestions.push('Make next action more specific. Use action verbs and include enough context to take action immediately.');
    }

    if (metrics.contextRelevance < 0.6) {
      suggestions.push('Consider adding or improving context tags (e.g., @computer, @phone, @errands).');
    }

    if (!todo.time_estimate) {
      suggestions.push('Consider adding a time estimate to help with planning.');
    }

    if (todo.description && todo.description.length < 20) {
      suggestions.push('Consider adding more description to provide context and background.');
    }

    return suggestions;
  }

  private generateSubtaskSuggestions(metrics: GTDQualityMetrics, subtask: Partial<Subtask>): string[] {
    const suggestions: string[] = [];

    if (!metrics.hasOutcome || metrics.outcomeClarity < 0.7) {
      suggestions.push('Clarify subtask outcome. What specific result should this subtask achieve?');
    }

    if (!metrics.hasNextAction || metrics.actionSpecificity < 0.7) {
      suggestions.push('Make subtask action more specific and immediately actionable.');
    }

    return suggestions;
  }
}