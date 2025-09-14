"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_db_1 = require("../helpers/test-db");
const factories_1 = require("../helpers/factories");
const llm_processing_1 = require("@/jobs/llm-processing"); // This will fail - doesn't exist yet
const quality_evaluation_1 = require("@/jobs/quality-evaluation"); // This will fail - doesn't exist yet
const subtask_decomposition_1 = require("@/jobs/subtask-decomposition"); // This will fail - doesn't exist yet
describe('LLM Processing Background Jobs', () => {
    let dbManager;
    let llmQueue;
    let mockBullQueue;
    beforeEach(async () => {
        dbManager = new test_db_1.TestDbManager();
        const db = await dbManager.setup();
        // Mock Bull queue
        mockBullQueue = {
            add: jest.fn(),
            process: jest.fn(),
            getJob: jest.fn(),
            getJobs: jest.fn(),
            getJobCounts: jest.fn(),
            removeJob: jest.fn(),
            clean: jest.fn(),
            pause: jest.fn(),
            resume: jest.fn(),
            close: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
        };
        // This will fail - queue doesn't exist
        llmQueue = new llm_processing_1.LLMProcessingQueue(db, {
            redis: {
                port: 6379,
                host: 'localhost',
                db: 1, // Test database
            },
            concurrency: 3,
            maxRetries: 3,
            backoff: {
                type: 'exponential',
                settings: {
                    delay: 2000,
                },
            },
        });
    });
    afterEach(async () => {
        await dbManager.cleanup();
    });
    describe('Quality Evaluation Jobs', () => {
        it('should queue todo quality evaluation job', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            const todo = factories_1.TestDataFactory.createTodo({
                user_id: user.id,
                gtd_quality_score: 0.5, // Below target threshold
            });
            await db.insertInto('users').values(user).execute();
            await db.insertInto('todos').values(todo).execute();
            const jobData = {
                todoId: todo.id,
                userId: user.id,
                evaluationType: 'quality_improvement',
                targetScore: 0.95,
                priority: 'medium',
            };
            // This should fail - method doesn't exist
            const jobId = await llmQueue.addQualityEvaluationJob(jobData);
            expect(mockBullQueue.add).toHaveBeenCalledWith('quality-evaluation', jobData, expect.objectContaining({
                priority: expect.any(Number),
                delay: expect.any(Number),
                attempts: 3,
            }));
            expect(jobId).toBeDefined();
        });
        it('should process quality evaluation job successfully', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            const todo = factories_1.TestDataFactory.createTodo({ user_id: user.id });
            await db.insertInto('users').values(user).execute();
            await db.insertInto('todos').values(todo).execute();
            const job = {
                id: 'job-123',
                data: {
                    todoId: todo.id,
                    userId: user.id,
                    evaluationType: 'quality_improvement',
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockLLMResponse = factories_1.TestDataFactory.createLLMAnalysisResponse({
                qualityScore: 0.92,
                clarified: true,
                suggestions: ['Consider adding time estimate'],
            });
            // Mock LLM service response
            const mockLLMService = {
                analyzeTodo: jest.fn().mockResolvedValue(mockLLMResponse),
            };
            const qualityJob = new quality_evaluation_1.QualityEvaluationJob(db, mockLLMService);
            // This should fail - method doesn't exist
            const result = await qualityJob.process(job);
            expect(result).toMatchObject({
                success: true,
                qualityScore: 0.92,
                improvementsMade: expect.any(Boolean),
            });
            // Verify todo was updated in database
            const updatedTodo = await db
                .selectFrom('todos')
                .where('id', '=', todo.id)
                .selectAll()
                .executeTakeFirst();
            expect(updatedTodo?.gtd_quality_score).toBe(0.92);
        });
        it('should handle LLM service failures gracefully', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo();
            const job = {
                id: 'job-456',
                data: {
                    todoId: todo.id,
                    userId: 'user-123',
                    evaluationType: 'quality_improvement',
                },
                attemptsMade: 1,
                opts: { attempts: 3 },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockLLMService = {
                analyzeTodo: jest.fn().mockRejectedValue(new Error('LLM API rate limit exceeded')),
            };
            const qualityJob = new quality_evaluation_1.QualityEvaluationJob(db, mockLLMService);
            // This should fail but be handled gracefully
            const result = await qualityJob.process(job);
            expect(result).toMatchObject({
                success: false,
                error: 'LLM API rate limit exceeded',
                shouldRetry: true,
                retryDelay: expect.any(Number),
            });
            // Should log the failure
            expect(job.log).toHaveBeenCalledWith('LLM service error: LLM API rate limit exceeded');
        });
        it('should implement exponential backoff on retries', async () => {
            const job = {
                id: 'job-789',
                data: { todoId: 'todo-123' },
                attemptsMade: 2, // Second retry
                opts: { attempts: 3 },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockLLMService = {
                analyzeTodo: jest.fn().mockRejectedValue(new Error('Temporary service unavailable')),
            };
            const qualityJob = new quality_evaluation_1.QualityEvaluationJob(dbManager.getKysely(), mockLLMService);
            const result = await qualityJob.process(job);
            expect(result.shouldRetry).toBe(true);
            expect(result.retryDelay).toBeGreaterThan(2000); // Base delay
            expect(result.retryDelay).toBeLessThan(10000); // Max reasonable delay
            // Delay should increase with attempt number
            const expectedDelay = 2000 * Math.pow(2, job.attemptsMade - 1);
            expect(result.retryDelay).toBeCloseTo(expectedDelay, -2); // Within 100ms
        });
        it('should batch process multiple todos efficiently', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            await db.insertInto('users').values(user).execute();
            const todos = [];
            for (let i = 0; i < 10; i++) {
                todos.push(factories_1.TestDataFactory.createTodo({
                    user_id: user.id,
                    gtd_quality_score: 0.6 + Math.random() * 0.2, // 0.6-0.8 range
                }));
            }
            await db.insertInto('todos').values(todos).execute();
            const batchJobData = {
                todoIds: todos.map(t => t.id),
                userId: user.id,
                evaluationType: 'batch_quality_improvement',
            };
            const jobId = await llmQueue.addBatchQualityEvaluationJob(batchJobData);
            expect(mockBullQueue.add).toHaveBeenCalledWith('batch-quality-evaluation', batchJobData, expect.objectContaining({
                priority: expect.any(Number),
            }));
            expect(jobId).toBeDefined();
        });
        it('should prioritize quality jobs based on todo urgency', async () => {
            const urgentTodo = factories_1.TestDataFactory.createTodo({ priority: 'urgent' });
            const normalTodo = factories_1.TestDataFactory.createTodo({ priority: 'medium' });
            const urgentJobId = await llmQueue.addQualityEvaluationJob({
                todoId: urgentTodo.id,
                userId: 'user-123',
                evaluationType: 'quality_improvement',
            });
            const normalJobId = await llmQueue.addQualityEvaluationJob({
                todoId: normalTodo.id,
                userId: 'user-123',
                evaluationType: 'quality_improvement',
            });
            const urgentCall = mockBullQueue.add.mock.calls.find(call => call[1].todoId === urgentTodo.id);
            const normalCall = mockBullQueue.add.mock.calls.find(call => call[1].todoId === normalTodo.id);
            // Urgent todos should have higher priority (lower number = higher priority)
            expect(urgentCall[2].priority).toBeLessThan(normalCall[2].priority);
        });
    });
    describe('Subtask Decomposition Jobs', () => {
        it('should queue subtask decomposition job for complex todos', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            const complexTodo = factories_1.TestDataFactory.createTodo({
                user_id: user.id,
                title: 'Launch new product website with full marketing campaign',
                description: 'Complex project requiring multiple phases and stakeholders',
                time_estimate: 480, // 8 hours - indicates complexity
            });
            await db.insertInto('users').values(user).execute();
            await db.insertInto('todos').values(complexTodo).execute();
            const jobData = {
                todoId: complexTodo.id,
                userId: user.id,
                decompositionType: 'comprehensive',
                maxSubtasks: 8,
            };
            const jobId = await llmQueue.addSubtaskDecompositionJob(jobData);
            expect(mockBullQueue.add).toHaveBeenCalledWith('subtask-decomposition', jobData, expect.objectContaining({
                priority: expect.any(Number),
                attempts: 3,
            }));
            expect(jobId).toBeDefined();
        });
        it('should process subtask decomposition job successfully', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            const todo = factories_1.TestDataFactory.createTodo({ user_id: user.id });
            await db.insertInto('users').values(user).execute();
            await db.insertInto('todos').values(todo).execute();
            const job = {
                id: 'decomposition-job-123',
                data: {
                    todoId: todo.id,
                    userId: user.id,
                    decompositionType: 'comprehensive',
                    maxSubtasks: 5,
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockDecomposition = factories_1.TestDataFactory.createLLMSubtaskDecomposition({
                subtasks: [
                    {
                        title: 'Planning and research phase',
                        outcome: 'Success looks like complete understanding of requirements',
                        nextAction: 'Review project specifications and create task list',
                        orderIndex: 0,
                        qualityScore: 0.88,
                    },
                    {
                        title: 'Implementation phase',
                        outcome: 'Success looks like working solution meeting requirements',
                        nextAction: 'Set up development environment and begin coding',
                        orderIndex: 1,
                        qualityScore: 0.85,
                    },
                ],
            });
            const mockLLMService = {
                decomposeIntoSubtasks: jest.fn().mockResolvedValue(mockDecomposition),
            };
            const decompositionJob = new subtask_decomposition_1.SubtaskDecompositionJob(db, mockLLMService);
            // This should fail - method doesn't exist
            const result = await decompositionJob.process(job);
            expect(result).toMatchObject({
                success: true,
                subtasksCreated: 2,
                averageQualityScore: expect.any(Number),
            });
            // Verify subtasks were created in database
            const subtasks = await db
                .selectFrom('subtasks')
                .where('todo_id', '=', todo.id)
                .selectAll()
                .execute();
            expect(subtasks).toHaveLength(2);
            expect(subtasks[0].order_index).toBe(0);
            expect(subtasks[1].order_index).toBe(1);
        });
        it('should avoid decomposing simple todos unnecessarily', async () => {
            const db = dbManager.getKysely();
            const simpleTodo = factories_1.TestDataFactory.createTodo({
                title: 'Send email to client',
                time_estimate: 5, // 5 minutes - very simple
            });
            const job = {
                id: 'simple-job-456',
                data: {
                    todoId: simpleTodo.id,
                    userId: 'user-123',
                    decompositionType: 'auto',
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockLLMService = {
                decomposeIntoSubtasks: jest.fn().mockResolvedValue({
                    shouldDecompose: false,
                    reasoning: 'This is a simple task that doesn\'t require decomposition',
                    subtasks: [],
                }),
            };
            const decompositionJob = new subtask_decomposition_1.SubtaskDecompositionJob(db, mockLLMService);
            const result = await decompositionJob.process(job);
            expect(result).toMatchObject({
                success: true,
                subtasksCreated: 0,
                shouldDecompose: false,
                reasoning: expect.stringContaining('simple task'),
            });
            expect(job.log).toHaveBeenCalledWith('Todo determined to be simple enough without decomposition');
        });
        it('should handle dependency resolution between subtasks', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo();
            const job = {
                id: 'dependency-job-789',
                data: {
                    todoId: todo.id,
                    userId: 'user-123',
                    decompositionType: 'with_dependencies',
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockDecomposition = {
                subtasks: [
                    {
                        title: 'Create database schema',
                        orderIndex: 0,
                        dependencies: [],
                    },
                    {
                        title: 'Implement API endpoints',
                        orderIndex: 1,
                        dependencies: [0], // Depends on first subtask
                    },
                    {
                        title: 'Write tests',
                        orderIndex: 2,
                        dependencies: [1], // Depends on second subtask
                    },
                ],
            };
            const mockLLMService = {
                decomposeIntoSubtasks: jest.fn().mockResolvedValue(mockDecomposition),
            };
            const decompositionJob = new subtask_decomposition_1.SubtaskDecompositionJob(db, mockLLMService);
            const result = await decompositionJob.process(job);
            expect(result.success).toBe(true);
            expect(result.dependenciesResolved).toBe(true);
            // Check that dependencies are properly tracked
            const subtasks = await db
                .selectFrom('subtasks')
                .where('todo_id', '=', todo.id)
                .orderBy('order_index', 'asc')
                .selectAll()
                .execute();
            // Second subtask should not be available until first is completed
            expect(subtasks[1].dependencies).toContain(subtasks[0].id);
        });
    });
    describe('Automatic Re-evaluation Jobs', () => {
        it('should schedule periodic re-evaluation for todos below excellence threshold', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            await db.insertInto('users').values(user).execute();
            const todos = [
                factories_1.TestDataFactory.createTodo({
                    user_id: user.id,
                    gtd_quality_score: 0.75, // Below 0.95 excellence threshold
                }),
                factories_1.TestDataFactory.createTodo({
                    user_id: user.id,
                    gtd_quality_score: 0.82, // Below threshold
                }),
                factories_1.TestDataFactory.createTodo({
                    user_id: user.id,
                    gtd_quality_score: 0.97, // Above threshold - should not be scheduled
                }),
            ];
            await db.insertInto('todos').values(todos).execute();
            // This should fail - method doesn't exist
            const scheduledCount = await llmQueue.schedulePeriodicReEvaluation({
                qualityThreshold: 0.95,
                intervalHours: 24,
                batchSize: 50,
            });
            expect(scheduledCount).toBe(2); // Only first two todos
            expect(mockBullQueue.add).toHaveBeenCalledTimes(2);
            // Verify scheduled jobs have correct delay (24 hours)
            const calls = mockBullQueue.add.mock.calls;
            calls.forEach(call => {
                expect(call[0]).toBe('quality-reevaluation');
                expect(call[2].delay).toBe(24 * 60 * 60 * 1000); // 24 hours in ms
            });
        });
        it('should process re-evaluation jobs and track improvements', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            const todo = factories_1.TestDataFactory.createTodo({
                user_id: user.id,
                gtd_quality_score: 0.7,
            });
            await db.insertInto('users').values(user).execute();
            await db.insertInto('todos').values(todo).execute();
            const job = {
                id: 'reevaluation-job-123',
                data: {
                    todoId: todo.id,
                    userId: user.id,
                    previousScore: 0.7,
                    targetScore: 0.95,
                    reevaluationType: 'periodic',
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockImprovedAnalysis = factories_1.TestDataFactory.createLLMAnalysisResponse({
                qualityScore: 0.89, // Improved but still below target
                improvementsMade: true,
                suggestions: ['Consider adding more specific context'],
            });
            const mockLLMService = {
                analyzeTodo: jest.fn().mockResolvedValue(mockImprovedAnalysis),
                improveTodoClarity: jest.fn().mockResolvedValue({
                    improvedOutcome: 'More specific outcome with measurable criteria',
                    qualityImprovement: 0.19, // 0.89 - 0.7
                }),
            };
            const reevaluationJob = new quality_evaluation_1.QualityEvaluationJob(db, mockLLMService);
            const result = await reevaluationJob.process(job);
            expect(result).toMatchObject({
                success: true,
                qualityScore: 0.89,
                improvementsMade: true,
                qualityImprovement: 0.19,
            });
            // Should schedule another re-evaluation since still below target
            expect(result.scheduleNextReEvaluation).toBe(true);
            expect(result.nextReEvaluationDelay).toBeGreaterThan(0);
        });
        it('should adapt re-evaluation frequency based on improvement rate', async () => {
            const rapidImprovementTodo = {
                currentScore: 0.85,
                previousScores: [0.6, 0.7, 0.8, 0.85], // Rapid improvement
                targetScore: 0.95,
            };
            const slowImprovementTodo = {
                currentScore: 0.72,
                previousScores: [0.7, 0.71, 0.715, 0.72], // Slow improvement  
                targetScore: 0.95,
            };
            // This should fail - method doesn't exist
            const rapidFrequency = await llmQueue.calculateOptimalReEvaluationFrequency(rapidImprovementTodo);
            const slowFrequency = await llmQueue.calculateOptimalReEvaluationFrequency(slowImprovementTodo);
            // Rapidly improving todos should be re-evaluated more frequently
            expect(rapidFrequency.intervalHours).toBeLessThan(slowFrequency.intervalHours);
            expect(rapidFrequency.confidence).toBeGreaterThan(0.7);
        });
        it('should pause re-evaluation for stagnant todos', async () => {
            const stagnantTodo = {
                currentScore: 0.73,
                previousScores: [0.73, 0.73, 0.73, 0.73], // No improvement
                lastImproved: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                reevaluationAttempts: 5,
            };
            const result = await llmQueue.evaluateReEvaluationStrategy(stagnantTodo);
            expect(result.shouldPause).toBe(true);
            expect(result.reason).toBe('no_improvement_detected');
            expect(result.pauseDuration).toBeGreaterThan(24 * 60 * 60 * 1000); // At least 24 hours
            expect(result.alternativeStrategy).toBe('manual_review_required');
        });
    });
    describe('Job Queue Management', () => {
        it('should monitor queue health and performance', async () => {
            // This should fail - method doesn't exist
            const queueStats = await llmQueue.getQueueStats();
            expect(queueStats).toMatchObject({
                waiting: expect.any(Number),
                active: expect.any(Number),
                completed: expect.any(Number),
                failed: expect.any(Number),
                delayed: expect.any(Number),
                paused: expect.any(Number),
            });
            const healthCheck = await llmQueue.healthCheck();
            expect(healthCheck).toMatchObject({
                status: expect.stringMatching(/^(healthy|warning|critical)$/),
                queueLength: expect.any(Number),
                processingTime: expect.objectContaining({
                    average: expect.any(Number),
                    p95: expect.any(Number),
                }),
                errorRate: expect.any(Number),
                memoryUsage: expect.any(Number),
            });
        });
        it('should handle job cleanup and archival', async () => {
            const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
            // This should fail - method doesn't exist
            const cleanupResult = await llmQueue.cleanupCompletedJobs({
                olderThan: cutoffDate,
                keepFailedJobs: 100, // Keep last 100 failed jobs for debugging
                archiveBeforeDelete: true,
            });
            expect(cleanupResult).toMatchObject({
                deletedJobs: expect.any(Number),
                archivedJobs: expect.any(Number),
                failedJobs: expect.any(Number),
                bytesFreed: expect.any(Number),
            });
            expect(mockBullQueue.clean).toHaveBeenCalledWith(7 * 24 * 60 * 60 * 1000, 'completed', expect.any(Number));
        });
        it('should implement circuit breaker for LLM service failures', async () => {
            const config = {
                failureThreshold: 5, // Trip after 5 failures
                resetTimeout: 60000, // Reset after 1 minute
                monitoringPeriod: 300000, // Monitor over 5 minutes
            };
            // This should fail - method doesn't exist
            await llmQueue.configureCircuitBreaker(config);
            // Simulate multiple failures
            for (let i = 0; i < 6; i++) {
                const job = {
                    id: `failure-job-${i}`,
                    data: { todoId: `todo-${i}` },
                };
                const mockLLMService = {
                    analyzeTodo: jest.fn().mockRejectedValue(new Error('Service unavailable')),
                };
                const qualityJob = new quality_evaluation_1.QualityEvaluationJob(dbManager.getKysely(), mockLLMService);
                try {
                    await qualityJob.process(job);
                }
                catch (error) {
                    // Expected failures
                }
            }
            const circuitStatus = await llmQueue.getCircuitBreakerStatus();
            expect(circuitStatus.state).toBe('OPEN'); // Circuit should be open
            expect(circuitStatus.failureCount).toBeGreaterThanOrEqual(5);
        });
        it('should implement job deduplication', async () => {
            const todoId = 'duplicate-test-todo';
            const jobData = {
                todoId,
                userId: 'user-123',
                evaluationType: 'quality_improvement',
            };
            // Add same job multiple times
            const jobId1 = await llmQueue.addQualityEvaluationJob(jobData);
            const jobId2 = await llmQueue.addQualityEvaluationJob(jobData);
            const jobId3 = await llmQueue.addQualityEvaluationJob(jobData);
            // Should deduplicate - only one job actually added
            expect(jobId1).toBe(jobId2);
            expect(jobId2).toBe(jobId3);
            expect(mockBullQueue.add).toHaveBeenCalledTimes(1);
        });
        it('should handle job cancellation and cleanup', async () => {
            const jobId = 'cancellation-test-job';
            // Queue a job
            await llmQueue.addQualityEvaluationJob({
                todoId: 'test-todo',
                userId: 'test-user',
                evaluationType: 'quality_improvement',
            });
            // Cancel the job
            const cancelResult = await llmQueue.cancelJob(jobId);
            expect(cancelResult.success).toBe(true);
            expect(mockBullQueue.removeJob).toHaveBeenCalledWith(jobId);
        });
        it('should provide job progress tracking', async () => {
            const job = {
                id: 'progress-test-job',
                data: {
                    todoId: 'test-todo',
                    userId: 'test-user',
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            const mockLLMService = {
                analyzeTodo: jest.fn().mockImplementation(async () => {
                    // Simulate progress updates
                    job.progress(25); // 25% complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                    job.progress(50); // 50% complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                    job.progress(75); // 75% complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                    job.progress(100); // Complete
                    return factories_1.TestDataFactory.createLLMAnalysisResponse();
                }),
            };
            const qualityJob = new quality_evaluation_1.QualityEvaluationJob(dbManager.getKysely(), mockLLMService);
            await qualityJob.process(job);
            // Verify progress was reported
            expect(job.progress).toHaveBeenCalledWith(25);
            expect(job.progress).toHaveBeenCalledWith(50);
            expect(job.progress).toHaveBeenCalledWith(75);
            expect(job.progress).toHaveBeenCalledWith(100);
        });
    });
});
//# sourceMappingURL=llm-processing.test.js.map