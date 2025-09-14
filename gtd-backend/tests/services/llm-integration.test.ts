import { TestDbManager } from '../helpers/test-db';
import { TestDataFactory } from '../helpers/factories';
import { LLMService } from '@/services/llm'; // This will fail - doesn't exist yet
import { OpenAIService } from '@/services/openai'; // This will fail - doesn't exist yet
import { QueueService } from '@/services/queue'; // This will fail - doesn't exist yet

describe('LLM Integration Service', () => {
  let dbManager: TestDbManager;
  let llmService: LLMService;
  let mockOpenAI: jest.Mocked<OpenAIService>;
  let mockQueue: jest.Mocked<QueueService>;

  beforeEach(async () => {
    dbManager = new TestDbManager();
    const db = await dbManager.setup();

    // Mock OpenAI service
    mockOpenAI = {
      createChatCompletion: jest.fn(),
      createEmbedding: jest.fn(),
      estimateTokens: jest.fn(),
    } as any;

    // Mock Queue service
    mockQueue = {
      add: jest.fn(),
      process: jest.fn(),
      getJob: jest.fn(),
      removeJob: jest.fn(),
    } as any;

    // This will fail - service doesn't exist
    llmService = new LLMService(db, mockOpenAI, mockQueue, {
      model: 'gpt-4',
      maxTokens: 4000,
      temperature: 0.3,
      qualityThreshold: 0.95,
    });
  });

  afterEach(async () => {
    await dbManager.cleanup();
  });

  describe('Todo Analysis', () => {
    it('should analyze todo for GTD compliance', async () => {
      const todo = {
        title: 'Complete project proposal',
        description: 'Write the Q4 project proposal with budget analysis',
        outcome: 'Success looks like having an approved project proposal',
        nextAction: 'Open the template and review requirements',
      };

      const mockAnalysis = TestDataFactory.createLLMAnalysisResponse({
        clarified: true,
        qualityScore: 0.92,
        outcomeClarity: 0.95,
        actionSpecificity: 0.88,
        suggestions: ['Consider adding time estimate'],
      });

      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(mockAnalysis),
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 200,
          total_tokens: 350,
        },
      });

      // This should fail - method doesn't exist
      const result = await llmService.analyzeTodo(todo);

      expect(result).toMatchObject({
        clarified: true,
        qualityScore: 0.92,
        outcomeClarity: 0.95,
        actionSpecificity: 0.88,
      });

      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('GTD methodology'),
            }),
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining(todo.title),
            }),
          ]),
        })
      );
    });

    it('should handle vague todos with improvement suggestions', async () => {
      const vagueTodo = {
        title: 'Do stuff',
        outcome: 'Get it done',
        nextAction: 'Start working',
      };

      const mockAnalysis = TestDataFactory.createLLMAnalysisResponse({
        clarified: false,
        qualityScore: 0.2,
        suggestions: [
          'Define what "stuff" specifically refers to',
          'Clarify what "done" means in measurable terms',
          'Specify the exact first action to take',
        ],
        improvementQuestions: [
          'What specific task or project are you working on?',
          'What does completion look like?',
          'What is the very next physical action you can take?',
        ],
      });

      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(mockAnalysis),
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 300, total_tokens: 400 },
      });

      const result = await llmService.analyzeTodo(vagueTodo);

      expect(result.clarified).toBe(false);
      expect(result.qualityScore).toBeLessThan(0.5);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.improvementQuestions.length).toBeGreaterThan(0);
    });

    it('should validate outcome specificity', async () => {
      const outcomes = [
        'Success looks like project done',
        'Success looks like completed project with stakeholder approval',
        'Success looks like the Q4 project proposal being submitted to the executive committee with full budget breakdown and timeline by December 15th',
      ];

      for (const outcome of outcomes) {
        const result = await llmService.analyzeOutcome(outcome);
        
        if (outcome.length > 100 && outcome.includes('specific')) {
          expect(result.specificityScore).toBeGreaterThan(0.8);
        } else {
          expect(result.specificityScore).toBeLessThan(0.8);
        }
      }
    });

    it('should validate next action actionability', async () => {
      const actions = [
        'Work on project',
        'Call John about the meeting',
        'Open Microsoft Excel, create new workbook, and enter the Q3 sales data from the CRM export file',
      ];

      for (const action of actions) {
        const result = await llmService.analyzeNextAction(action);
        
        if (action.includes('Open') && action.includes('specific')) {
          expect(result.actionabilityScore).toBeGreaterThan(0.8);
        } else if (action.includes('Work on')) {
          expect(result.actionabilityScore).toBeLessThan(0.5);
        }
      }
    });
  });

  describe('Subtask Decomposition', () => {
    it('should decompose complex todos into subtasks', async () => {
      const complexTodo = {
        title: 'Launch new product website',
        description: 'Create and deploy a marketing website for the new product launch',
        outcome: 'Success looks like a live, fully-functional product website with all content, forms working, and analytics tracking',
        nextAction: 'Review the product specifications and marketing materials',
      };

      const mockDecomposition = TestDataFactory.createLLMSubtaskDecomposition({
        subtasks: [
          {
            title: 'Content creation and copywriting',
            outcome: 'Success looks like all website copy written, reviewed, and approved',
            nextAction: 'Review product specs and create content outline',
            orderIndex: 0,
            qualityScore: 0.90,
          },
          {
            title: 'Design and development',
            outcome: 'Success looks like responsive website built and tested',
            nextAction: 'Set up development environment and create wireframes',
            orderIndex: 1,
            qualityScore: 0.88,
          },
          {
            title: 'Deployment and launch',
            outcome: 'Success looks like website live on production with monitoring',
            nextAction: 'Configure hosting environment and domain settings',
            orderIndex: 2,
            qualityScore: 0.92,
          },
        ],
      });

      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(mockDecomposition),
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 200, completion_tokens: 500, total_tokens: 700 },
      });

      // This should fail - method doesn't exist
      const result = await llmService.decomposeIntoSubtasks(complexTodo);

      expect(result.subtasks).toHaveLength(3);
      expect(result.subtasks[0]).toMatchObject({
        title: expect.stringContaining('Content'),
        outcome: expect.stringContaining('Success looks like'),
        nextAction: expect.any(String),
        orderIndex: 0,
      });

      // Each subtask should have high quality scores
      result.subtasks.forEach(subtask => {
        expect(subtask.qualityScore).toBeGreaterThan(0.8);
      });
    });

    it('should maintain logical ordering of subtasks', async () => {
      const projectTodo = {
        title: 'Organize team offsite event',
        outcome: 'Success looks like successful 2-day team offsite with high engagement',
        nextAction: 'Research potential venues and check budget allocation',
      };

      const result = await llmService.decomposeIntoSubtasks(projectTodo);

      // Subtasks should be in logical order
      const orderIndexes = result.subtasks.map(s => s.orderIndex);
      expect(orderIndexes).toEqual([...orderIndexes].sort((a, b) => a - b));

      // Earlier tasks should be prerequisites for later ones
      expect(result.subtasks[0].title).toMatch(/plan|research|budget/i);
      expect(result.subtasks[result.subtasks.length - 1].title).toMatch(/execute|run|conduct/i);
    });

    it('should not decompose simple todos unnecessarily', async () => {
      const simpleTodo = {
        title: 'Email client about meeting time',
        outcome: 'Success looks like client confirming meeting time for next week',
        nextAction: 'Open email client and compose message to client',
      };

      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              shouldDecompose: false,
              reasoning: 'This is a simple, single-action task that doesn\'t require decomposition',
              estimatedComplexity: 0.2,
            }),
            role: 'assistant',
          },
        }],
        usage: { prompt_tokens: 80, completion_tokens: 50, total_tokens: 130 },
      });

      const result = await llmService.decomposeIntoSubtasks(simpleTodo);

      expect(result.shouldDecompose).toBe(false);
      expect(result.subtasks).toHaveLength(0);
      expect(result.reasoning).toContain('simple');
    });

    it('should estimate subtask time and dependencies', async () => {
      const todo = {
        title: 'Migrate database to new server',
        outcome: 'Success looks like all data migrated safely with zero downtime',
        nextAction: 'Create backup of current database',
      };

      const result = await llmService.decomposeIntoSubtasks(todo);

      result.subtasks.forEach(subtask => {
        expect(subtask).toHaveProperty('estimatedDuration');
        expect(subtask.estimatedDuration).toBeGreaterThan(0);
        
        if (subtask.dependencies) {
          expect(Array.isArray(subtask.dependencies)).toBe(true);
        }
      });

      // Verify dependencies are logical
      const backupTask = result.subtasks.find(s => s.title.includes('backup'));
      const migrationTask = result.subtasks.find(s => s.title.includes('migrate'));
      
      if (backupTask && migrationTask) {
        expect(migrationTask.dependencies).toContain(backupTask.orderIndex);
      }
    });
  });

  describe('Quality Improvement', () => {
    it('should improve low-quality todos while preserving intent', async () => {
      const lowQualityTodo = {
        title: 'Meeting prep',
        outcome: 'Ready for meeting',
        nextAction: 'Prepare',
      };

      const mockImprovement = {
        improvedTitle: 'Prepare for quarterly review meeting with stakeholders',
        improvedOutcome: 'Success looks like being fully prepared for the quarterly review meeting with all metrics compiled, slides reviewed, and talking points practiced',
        improvedNextAction: 'Open the quarterly metrics spreadsheet and compile the latest performance data',
        preservedIntent: true,
        improvements: {
          title: 'Made more specific by identifying the type of meeting',
          outcome: 'Added measurable success criteria and specific deliverables',
          nextAction: 'Specified the exact first step with the tool and data source',
        },
        qualityImprovement: 0.7, // Improvement from 0.2 to 0.9
      };

      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(mockImprovement),
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 },
      });

      // This should fail - method doesn't exist
      const result = await llmService.improveTodoClarity(lowQualityTodo);

      expect(result.improvedOutcome).toContain('Success looks like');
      expect(result.improvedNextAction).toMatch(/^[A-Z]/); // Starts with capital letter
      expect(result.preservedIntent).toBe(true);
      expect(result.qualityImprovement).toBeGreaterThan(0.5);
    });

    it('should provide contextual suggestions based on todo type', async () => {
      const todoTypes = [
        {
          todo: { title: 'Code review', outcome: 'Code reviewed', nextAction: 'Review code' },
          expectedSuggestions: ['tool', 'repository', 'criteria'],
        },
        {
          todo: { title: 'Client call', outcome: 'Called client', nextAction: 'Call' },
          expectedSuggestions: ['agenda', 'phone number', 'purpose'],
        },
        {
          todo: { title: 'Write report', outcome: 'Report written', nextAction: 'Write' },
          expectedSuggestions: ['deadline', 'audience', 'format'],
        },
      ];

      for (const { todo, expectedSuggestions } of todoTypes) {
        const result = await llmService.improveTodoClarity(todo);
        
        const suggestionText = result.improvements.join(' ').toLowerCase();
        expectedSuggestions.forEach(keyword => {
          expect(suggestionText).toContain(keyword);
        });
      }
    });

    it('should handle edge cases gracefully', async () => {
      const edgeCases = [
        { title: '', outcome: '', nextAction: '' }, // Empty todo
        { title: 'A'.repeat(1000), outcome: 'B'.repeat(1000), nextAction: 'C'.repeat(1000) }, // Very long todo
        { title: '🚀📊💼', outcome: '✅🎯📈', nextAction: '🔄⚡🏃‍♂️' }, // Emoji-only todo
      ];

      for (const todo of edgeCases) {
        // Should not throw errors
        const result = await llmService.improveTodoClarity(todo);
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
      }
    });
  });

  describe('Background Processing', () => {
    it('should queue LLM analysis for background processing', async () => {
      const db = dbManager.getKysely();
      const user = TestDataFactory.createUser();
      const todo = TestDataFactory.createTodo({ user_id: user.id });
      
      await db.insertInto('users').values(user).execute();
      await db.insertInto('todos').values(todo).execute();

      // This should fail - method doesn't exist
      await llmService.queueAnalysis(todo.id, {
        priority: 'high',
        analysisType: 'quality_improvement',
        userId: user.id,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'llm-analysis',
        expect.objectContaining({
          todoId: todo.id,
          analysisType: 'quality_improvement',
        }),
        expect.objectContaining({
          priority: 'high',
        })
      );
    });

    it('should process queued analysis jobs', async () => {
      const job = {
        id: 'job-123',
        data: {
          todoId: 'todo-456',
          analysisType: 'quality_improvement',
          userId: 'user-789',
        },
      };

      mockQueue.getJob.mockResolvedValueOnce(job);

      const mockAnalysisResult = TestDataFactory.createLLMAnalysisResponse();
      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(mockAnalysisResult),
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 150, completion_tokens: 200, total_tokens: 350 },
      });

      // This should fail - method doesn't exist
      await llmService.processAnalysisJob(job);

      // Should update todo in database
      const db = dbManager.getKysely();
      const updatedTodo = await db
        .selectFrom('todos')
        .where('id', '=', job.data.todoId)
        .selectAll()
        .executeTakeFirst();

      expect(updatedTodo?.gtd_quality_score).toBe(mockAnalysisResult.qualityScore);
    });

    it('should handle batch processing for multiple todos', async () => {
      const db = dbManager.getKysely();
      const user = TestDataFactory.createUser();
      await db.insertInto('users').values(user).execute();

      const todos = [];
      for (let i = 0; i < 10; i++) {
        todos.push(TestDataFactory.createTodo({ user_id: user.id }));
      }
      await db.insertInto('todos').values(todos).execute();

      const todoIds = todos.map(t => t.id);
      
      // Mock batch analysis
      const mockBatchResult = todoIds.map(id => ({
        todoId: id,
        analysis: TestDataFactory.createLLMAnalysisResponse(),
      }));

      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({ analyses: mockBatchResult }),
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 500, completion_tokens: 800, total_tokens: 1300 },
      });

      const result = await llmService.batchAnalyzeTodos(todoIds);

      expect(result.length).toBe(10);
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(1); // Single batch call
    });

    it('should handle rate limiting and retry logic', async () => {
      const todo = {
        title: 'Test rate limiting',
        outcome: 'Success looks like handling rate limits gracefully',
        nextAction: 'Submit request and handle 429 responses',
      };

      // Mock rate limit error first, then success
      mockOpenAI.createChatCompletion
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify(TestDataFactory.createLLMAnalysisResponse()),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 100, completion_tokens: 150, total_tokens: 250 },
        });

      const result = await llmService.analyzeTodo(todo);

      expect(result).toBeDefined();
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(2); // Original + retry
    });
  });

  describe('Token Management', () => {
    it('should estimate token usage before making requests', async () => {
      const longTodo = {
        title: 'Very long todo title'.repeat(20),
        description: 'Very long description'.repeat(50),
        outcome: 'Very long outcome description'.repeat(30),
        nextAction: 'Very long next action'.repeat(25),
      };

      mockOpenAI.estimateTokens.mockReturnValueOnce(2500);

      const estimation = await llmService.estimateAnalysisTokens(longTodo);

      expect(estimation.estimatedTokens).toBe(2500);
      expect(estimation.exceedsLimit).toBe(false); // Assuming 4000 token limit
      expect(mockOpenAI.estimateTokens).toHaveBeenCalled();
    });

    it('should truncate content that exceeds token limits', async () => {
      const hugeTodo = {
        title: 'Normal title',
        description: 'X'.repeat(10000), // Very long description
        outcome: 'Normal outcome',
        nextAction: 'Normal action',
      };

      mockOpenAI.estimateTokens.mockReturnValueOnce(8000); // Exceeds 4000 limit

      const result = await llmService.analyzeTodo(hugeTodo);

      // Should have truncated the input
      const actualCall = mockOpenAI.createChatCompletion.mock.calls[0][0];
      const userMessage = actualCall.messages.find((m: any) => m.role === 'user');
      
      expect(userMessage.content.length).toBeLessThan(hugeTodo.description.length);
      expect(userMessage.content).toContain('...'); // Truncation indicator
    });

    it('should track and report token usage', async () => {
      const todo = TestDataFactory.createTodo();
      
      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(TestDataFactory.createLLMAnalysisResponse()),
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 200, completion_tokens: 150, total_tokens: 350 },
      });

      const result = await llmService.analyzeTodo(todo);

      expect(result.tokenUsage).toEqual({
        promptTokens: 200,
        completionTokens: 150,
        totalTokens: 350,
      });

      // Should log usage for monitoring
      const usage = await llmService.getTokenUsageStats();
      expect(usage.totalTokensUsed).toBeGreaterThan(0);
    });
  });

  describe('Caching and Performance', () => {
    it('should cache repeated analysis requests', async () => {
      const todo = TestDataFactory.createTodo();

      // First call
      await llmService.analyzeTodo(todo);
      
      // Second identical call should use cache
      await llmService.analyzeTodo(todo);

      // OpenAI should only be called once
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache on todo updates', async () => {
      const todo = TestDataFactory.createTodo();

      // Initial analysis
      await llmService.analyzeTodo(todo);

      // Update todo
      const updatedTodo = { ...todo, outcome: 'Updated outcome for cache invalidation test' };
      
      // Analysis of updated todo should not use cache
      await llmService.analyzeTodo(updatedTodo);

      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(2);
    });

    it('should have cache TTL for automatic expiration', async () => {
      const todo = TestDataFactory.createTodo();

      // First call
      await llmService.analyzeTodo(todo);

      // Mock time passage beyond TTL
      jest.useFakeTimers();
      jest.advanceTimersByTime(3600000); // 1 hour

      // Second call should not use expired cache
      await llmService.analyzeTodo(todo);

      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });
});