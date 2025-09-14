import OpenAI from 'openai';
import type { GTDAnalysisResult, GTDSubtaskDecomposition } from '@/types/gtd';
import type { Todo } from '@/types/database';
import { TRPCError } from '@trpc/server';

export class LLMIntegrationService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  /**
   * Analyzes a todo and suggests improvements to meet GTD standards
   */
  async analyzeTodo(todo: Partial<Todo>): Promise<GTDAnalysisResult> {
    try {
      const prompt = this.buildAnalysisPrompt(todo);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a GTD (Getting Things Done) methodology expert. Analyze todos and provide specific, actionable improvements. Always respond with valid JSON matching the expected schema.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return this.parseAnalysisResponse(content);
    } catch (error) {
      console.error('LLM Analysis Error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to analyze todo with AI',
        cause: error,
      });
    }
  }

  /**
   * Decomposes a complex todo into actionable subtasks
   */
  async decomposeIntoSubtasks(todo: Todo): Promise<GTDSubtaskDecomposition> {
    try {
      const prompt = this.buildDecompositionPrompt(todo);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a GTD expert specializing in breaking down complex tasks into clear, actionable subtasks. Each subtask should follow GTD principles with clear outcomes and next actions.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return this.parseDecompositionResponse(content);
    } catch (error) {
      console.error('LLM Decomposition Error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to decompose todo with AI',
        cause: error,
      });
    }
  }

  /**
   * Re-evaluates and suggests improvements for an existing todo
   */
  async reevaluateQuality(todo: Todo): Promise<GTDAnalysisResult> {
    try {
      const prompt = this.buildReevaluationPrompt(todo);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a GTD methodology expert. Re-evaluate existing todos for quality and suggest specific improvements to reach 95%+ GTD quality score.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return this.parseAnalysisResponse(content);
    } catch (error) {
      console.error('LLM Reevaluation Error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to reevaluate todo with AI',
        cause: error,
      });
    }
  }

  private buildAnalysisPrompt(todo: Partial<Todo>): string {
    return `
Analyze this todo according to GTD (Getting Things Done) methodology principles:

Title: ${todo.title || 'Untitled'}
Description: ${todo.description || 'No description'}
Current Outcome: ${todo.outcome || 'Not specified'}
Current Next Action: ${todo.next_action || 'Not specified'}
Context: ${todo.context || 'Not specified'}
Priority: ${todo.priority || 'Not specified'}
Energy Level: ${todo.energy_level || 'Not specified'}
Time Estimate: ${todo.time_estimate ? `${todo.time_estimate} minutes` : 'Not specified'}

Please analyze and improve this todo to meet GTD standards. Respond with JSON in this exact format:
{
  "clarified": boolean,
  "outcome": "Improved outcome statement starting with 'Success looks like...'",
  "nextAction": "Specific, actionable next step with action verb",
  "qualityScore": number between 0 and 1,
  "context": "Appropriate context (e.g., @computer, @phone, @errands)",
  "energyLevel": "low" | "medium" | "high",
  "timeEstimate": number in minutes,
  "subtasks": [],
  "reasoning": "Brief explanation of changes made"
}

Requirements:
- Outcome must start with "Success looks like..." and be specific
- Next action must start with an action verb and be immediately actionable  
- Quality score should be 0.95+ for well-formed todos
- Context should match the type of action required
`;
  }

  private buildDecompositionPrompt(todo: Todo): string {
    return `
Break down this complex todo into actionable subtasks following GTD principles:

Title: ${todo.title}
Description: ${todo.description || 'No description'}
Outcome: ${todo.outcome}
Context: ${todo.context || 'Not specified'}
Time Estimate: ${todo.time_estimate ? `${todo.time_estimate} minutes` : 'Not specified'}

Create 2-5 subtasks that together achieve the main todo's outcome. Each subtask should be independently actionable.

Respond with JSON in this exact format:
{
  "subtasks": [
    {
      "title": "Specific subtask title",
      "outcome": "Success looks like... (specific outcome for this subtask)",
      "nextAction": "Action verb + specific first step",
      "orderIndex": 0,
      "qualityScore": number between 0 and 1
    }
  ],
  "reasoning": "Brief explanation of how tasks were broken down",
  "totalQualityScore": number between 0 and 1
}

Each subtask should:
- Have a clear, specific outcome
- Start with an action verb in the nextAction
- Be independently completable
- Contribute to the overall todo outcome
`;
  }

  private buildReevaluationPrompt(todo: Todo): string {
    return `
Re-evaluate this existing todo for GTD quality and suggest improvements:

Title: ${todo.title}
Description: ${todo.description || 'No description'}
Outcome: ${todo.outcome}
Next Action: ${todo.next_action}
Context: ${todo.context || 'Not specified'}
Current Quality Score: ${todo.gtd_quality_score}
Priority: ${todo.priority}
Energy Level: ${todo.energy_level}
Time Estimate: ${todo.time_estimate ? `${todo.time_estimate} minutes` : 'Not specified'}

Current quality score is ${todo.gtd_quality_score}. We need 0.95+ for GTD compliance.

Respond with JSON improvements in this exact format:
{
  "clarified": true,
  "outcome": "Improved outcome if needed (or keep current if already good)",
  "nextAction": "Improved next action if needed (or keep current if already good)",
  "qualityScore": number between 0 and 1,
  "context": "Improved context if needed",
  "energyLevel": "low" | "medium" | "high",
  "timeEstimate": number in minutes,
  "subtasks": [],
  "reasoning": "Specific explanation of what was improved and why"
}

Focus on reaching 95%+ quality score by improving outcome clarity and next action specificity.
`;
  }

  private parseAnalysisResponse(content: string): GTDAnalysisResult {
    try {
      // Clean up the response - remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      
      // Validate required fields
      if (!parsed.outcome || !parsed.nextAction || typeof parsed.qualityScore !== 'number') {
        throw new Error('Invalid response format from AI');
      }

      return {
        clarified: parsed.clarified ?? true,
        outcome: parsed.outcome,
        nextAction: parsed.nextAction,
        qualityScore: Math.min(Math.max(parsed.qualityScore, 0), 1), // Clamp between 0-1
        context: parsed.context,
        energyLevel: parsed.energyLevel,
        timeEstimate: parsed.timeEstimate,
        subtasks: parsed.subtasks || [],
        reasoning: parsed.reasoning || 'AI analysis completed',
      };
    } catch (error) {
      console.error('Failed to parse AI response:', content, error);
      throw new Error('Failed to parse AI response');
    }
  }

  private parseDecompositionResponse(content: string): GTDSubtaskDecomposition {
    try {
      const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      
      if (!Array.isArray(parsed.subtasks)) {
        throw new Error('Invalid subtasks format from AI');
      }

      // Validate each subtask
      const validatedSubtasks = parsed.subtasks.map((subtask: any, index: number) => ({
        title: subtask.title || `Subtask ${index + 1}`,
        outcome: subtask.outcome || 'Success looks like completing this subtask',
        nextAction: subtask.nextAction || 'Start working on this subtask',
        orderIndex: subtask.orderIndex ?? index,
        qualityScore: Math.min(Math.max(subtask.qualityScore || 0.8, 0), 1),
      }));

      return {
        subtasks: validatedSubtasks,
        reasoning: parsed.reasoning || 'AI decomposition completed',
        totalQualityScore: Math.min(Math.max(parsed.totalQualityScore || 0.85, 0), 1),
      };
    } catch (error) {
      console.error('Failed to parse AI decomposition response:', content, error);
      throw new Error('Failed to parse AI decomposition response');
    }
  }
}