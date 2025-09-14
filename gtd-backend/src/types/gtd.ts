export interface GTDQualityMetrics {
  hasOutcome: boolean;
  hasNextAction: boolean;
  outcomeClarity: number; // 0-1
  actionSpecificity: number; // 0-1
  contextRelevance: number; // 0-1
  estimateAccuracy: number; // 0-1
  overallScore: number; // 0-1
  suggestions: string[];
}

export interface GTDAnalysisResult {
  clarified: boolean;
  outcome: string;
  nextAction: string;
  qualityScore: number;
  context?: string;
  energyLevel?: 'low' | 'medium' | 'high';
  timeEstimate?: number; // minutes
  subtasks: GTDSubtaskSuggestion[];
  reasoning: string;
}

export interface GTDSubtaskSuggestion {
  title: string;
  outcome: string;
  nextAction: string;
  orderIndex: number;
  qualityScore: number;
}

export interface GTDSubtaskDecomposition {
  subtasks: GTDSubtaskSuggestion[];
  reasoning: string;
  totalQualityScore: number;
}

export const GTD_QUALITY_THRESHOLD = 0.95;