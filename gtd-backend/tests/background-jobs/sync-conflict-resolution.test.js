"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_db_1 = require("../helpers/test-db");
const factories_1 = require("../helpers/factories");
const sync_conflict_resolution_1 = require("@/jobs/sync-conflict-resolution"); // This will fail - doesn't exist yet
const conflict_resolution_1 = require("@/jobs/conflict-resolution"); // This will fail - doesn't exist yet
describe('Sync Conflict Resolution Background Jobs', () => {
    let dbManager;
    let conflictResolver;
    let mockVectorClockService;
    let mockBullQueue;
    beforeEach(async () => {
        dbManager = new test_db_1.TestDbManager();
        const db = await dbManager.setup();
        mockVectorClockService = {
            compare: jest.fn(),
            merge: jest.fn(),
            increment: jest.fn(),
            detectConflicts: jest.fn(),
            resolveConcurrentUpdates: jest.fn(),
        };
        mockBullQueue = {
            add: jest.fn(),
            process: jest.fn(),
            getJob: jest.fn(),
            getJobs: jest.fn(),
        };
        // This will fail - resolver doesn't exist
        conflictResolver = new sync_conflict_resolution_1.SyncConflictResolver(db, mockVectorClockService, {
            redis: {
                port: 6379,
                host: 'localhost',
                db: 1,
            },
            conflictResolutionStrategy: 'smart_merge',
            maxConflictAge: 24 * 60 * 60 * 1000, // 24 hours
        });
    });
    afterEach(async () => {
        await dbManager.cleanup();
    });
    describe('Conflict Detection', () => {
        it('should detect concurrent modifications using vector clocks', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            await db.insertInto('users').values(user).execute();
            // Create todo with initial vector clock
            const todo = factories_1.TestDataFactory.createTodo({
                user_id: user.id,
                vector_clock: JSON.stringify({ 'device-1': 1 }),
                last_modified_device: 'device-1',
            });
            await db.insertInto('todos').values(todo).execute();
            // Simulate concurrent modifications from two devices
            const device1Update = {
                todoId: todo.id,
                deviceId: 'device-1',
                vectorClock: { 'device-1': 2 }, // Device 1 increments
                changes: { title: 'Updated by device 1' },
                timestamp: new Date(),
            };
            const device2Update = {
                todoId: todo.id,
                deviceId: 'device-2',
                vectorClock: { 'device-1': 1, 'device-2': 1 }, // Device 2 starts from old state
                changes: { outcome: 'Updated by device 2' },
                timestamp: new Date(Date.now() + 1000), // Slightly later
            };
            mockVectorClockService.detectConflicts.mockReturnValue({
                hasConflict: true,
                conflictType: 'concurrent_modification',
                conflictingDevices: ['device-1', 'device-2'],
            });
            // This should fail - method doesn't exist
            const conflictDetection = await conflictResolver.detectConflicts([
                device1Update,
                device2Update,
            ]);
            expect(conflictDetection.conflicts).toHaveLength(1);
            expect(conflictDetection.conflicts[0]).toMatchObject({
                todoId: todo.id,
                conflictType: 'concurrent_modification',
                deviceIds: ['device-1', 'device-2'],
            });
        });
        it('should queue conflict resolution jobs for detected conflicts', async () => {
            const conflictData = {
                todoId: 'conflicted-todo-123',
                userId: 'user-456',
                conflictType: 'concurrent_modification',
                conflictingUpdates: [
                    {
                        deviceId: 'device-1',
                        changes: { title: 'Version A' },
                        vectorClock: { 'device-1': 2 },
                        timestamp: new Date('2024-01-01T10:00:00Z'),
                    },
                    {
                        deviceId: 'device-2',
                        changes: { title: 'Version B' },
                        vectorClock: { 'device-1': 1, 'device-2': 1 },
                        timestamp: new Date('2024-01-01T10:01:00Z'),
                    },
                ],
            };
            const jobId = await conflictResolver.queueConflictResolution(conflictData);
            expect(mockBullQueue.add).toHaveBeenCalledWith('conflict-resolution', conflictData, expect.objectContaining({
                priority: expect.any(Number),
                delay: expect.any(Number),
            }));
            expect(jobId).toBeDefined();
        });
        it('should prioritize conflict resolution based on todo importance', async () => {
            const urgentConflict = {
                todoId: 'urgent-todo',
                priority: 'urgent',
                dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // Due in 2 hours
            };
            const normalConflict = {
                todoId: 'normal-todo',
                priority: 'medium',
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
            };
            await conflictResolver.queueConflictResolution(urgentConflict);
            await conflictResolver.queueConflictResolution(normalConflict);
            const urgentCall = mockBullQueue.add.mock.calls.find(call => call[1].todoId === 'urgent-todo');
            const normalCall = mockBullQueue.add.mock.calls.find(call => call[1].todoId === 'normal-todo');
            // Urgent conflicts should have higher priority
            expect(urgentCall[2].priority).toBeLessThan(normalCall[2].priority);
        });
    });
    describe('Conflict Resolution Strategies', () => {
        it('should resolve simple non-conflicting field updates automatically', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo();
            const job = {
                id: 'auto-resolve-job',
                data: {
                    todoId: todo.id,
                    conflictType: 'non_conflicting_fields',
                    conflictingUpdates: [
                        {
                            deviceId: 'device-1',
                            changes: { title: 'Updated title' }, // Different fields
                            vectorClock: { 'device-1': 2 },
                        },
                        {
                            deviceId: 'device-2',
                            changes: { context: '@home' }, // Different fields
                            vectorClock: { 'device-1': 1, 'device-2': 1 },
                        },
                    ],
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            mockVectorClockService.resolveConcurrentUpdates.mockReturnValue({
                resolvedVectorClock: { 'device-1': 2, 'device-2': 1 },
                mergedChanges: {
                    title: 'Updated title',
                    context: '@home',
                },
                conflictResolution: 'auto_merge',
            });
            const conflictJob = new conflict_resolution_1.ConflictResolutionJob(db, mockVectorClockService);
            // This should fail - method doesn't exist
            const result = await conflictJob.process(job);
            expect(result).toMatchObject({
                success: true,
                resolution: 'auto_merge',
                conflictsResolved: 1,
                manualInterventionRequired: false,
            });
            expect(job.log).toHaveBeenCalledWith('Auto-merged non-conflicting field updates');
        });
        it('should use Last Writer Wins for timestamp-based resolution', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo();
            const job = {
                id: 'lww-job',
                data: {
                    todoId: todo.id,
                    conflictType: 'same_field_modification',
                    resolutionStrategy: 'last_writer_wins',
                    conflictingUpdates: [
                        {
                            deviceId: 'device-1',
                            changes: { outcome: 'Outcome version A' },
                            timestamp: new Date('2024-01-01T10:00:00Z'),
                            vectorClock: { 'device-1': 2 },
                        },
                        {
                            deviceId: 'device-2',
                            changes: { outcome: 'Outcome version B' },
                            timestamp: new Date('2024-01-01T10:05:00Z'), // Later timestamp
                            vectorClock: { 'device-1': 1, 'device-2': 1 },
                        },
                    ],
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            mockVectorClockService.resolveConcurrentUpdates.mockReturnValue({
                resolvedVectorClock: { 'device-1': 2, 'device-2': 1 },
                mergedChanges: {
                    outcome: 'Outcome version B', // Later timestamp wins
                },
                conflictResolution: 'last_writer_wins',
                winningDevice: 'device-2',
            });
            const conflictJob = new conflict_resolution_1.ConflictResolutionJob(db, mockVectorClockService);
            const result = await conflictJob.process(job);
            expect(result).toMatchObject({
                success: true,
                resolution: 'last_writer_wins',
                winningDevice: 'device-2',
            });
            expect(job.log).toHaveBeenCalledWith('Resolved using Last Writer Wins: device-2 wins');
        });
        it('should perform intelligent content merging for text fields', async () => {
            const db = dbManager.getKysely();
            const job = {
                id: 'content-merge-job',
                data: {
                    todoId: 'merge-test-todo',
                    conflictType: 'content_modification',
                    resolutionStrategy: 'intelligent_merge',
                    conflictingUpdates: [
                        {
                            deviceId: 'device-1',
                            changes: {
                                description: 'Original description with additional details from device 1'
                            },
                            vectorClock: { 'device-1': 2 },
                        },
                        {
                            deviceId: 'device-2',
                            changes: {
                                description: 'Original description with different additions from device 2'
                            },
                            vectorClock: { 'device-1': 1, 'device-2': 1 },
                        },
                    ],
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            // Mock intelligent merge result
            mockVectorClockService.resolveConcurrentUpdates.mockReturnValue({
                resolvedVectorClock: { 'device-1': 2, 'device-2': 1 },
                mergedChanges: {
                    description: 'Original description with additional details from device 1 and different additions from device 2',
                },
                conflictResolution: 'intelligent_merge',
                mergeStrategy: 'content_combination',
                confidence: 0.85,
            });
            const conflictJob = new conflict_resolution_1.ConflictResolutionJob(db, mockVectorClockService);
            const result = await conflictJob.process(job);
            expect(result).toMatchObject({
                success: true,
                resolution: 'intelligent_merge',
                mergeConfidence: 0.85,
            });
        });
        it('should flag complex conflicts for manual review', async () => {
            const db = dbManager.getKysely();
            const job = {
                id: 'manual-review-job',
                data: {
                    todoId: 'complex-conflict-todo',
                    conflictType: 'complex_semantic_conflict',
                    conflictingUpdates: [
                        {
                            deviceId: 'device-1',
                            changes: {
                                outcome: 'Success looks like project completion with full testing',
                                nextAction: 'Complete comprehensive testing phase',
                            },
                        },
                        {
                            deviceId: 'device-2',
                            changes: {
                                outcome: 'Success looks like project cancellation due to budget cuts',
                                nextAction: 'Inform stakeholders about project cancellation',
                            },
                        },
                    ],
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            mockVectorClockService.resolveConcurrentUpdates.mockReturnValue({
                conflictResolution: 'manual_review_required',
                reason: 'Semantic conflict detected - contradictory outcomes',
                confidence: 0.1, // Very low confidence in auto-resolution
            });
            const conflictJob = new conflict_resolution_1.ConflictResolutionJob(db, mockVectorClockService);
            const result = await conflictJob.process(job);
            expect(result).toMatchObject({
                success: true,
                resolution: 'manual_review_required',
                manualInterventionRequired: true,
                reason: 'Semantic conflict detected - contradictory outcomes',
            });
            // Should create manual review record
            const manualReview = await db
                .selectFrom('manual_conflict_reviews')
                .where('todo_id', '=', 'complex-conflict-todo')
                .selectAll()
                .executeTakeFirst();
            expect(manualReview).toBeTruthy();
            expect(manualReview?.status).toBe('pending_review');
        });
    });
    describe('Subtask Conflict Resolution', () => {
        it('should handle subtask ordering conflicts', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            const todo = factories_1.TestDataFactory.createTodo({ user_id: user.id });
            await db.insertInto('users').values(user).execute();
            await db.insertInto('todos').values(todo).execute();
            // Create conflicting subtask orderings
            const subtasks = [
                factories_1.TestDataFactory.createSubtask({ todo_id: todo.id, order_index: 0 }),
                factories_1.TestDataFactory.createSubtask({ todo_id: todo.id, order_index: 1 }),
                factories_1.TestDataFactory.createSubtask({ todo_id: todo.id, order_index: 2 }),
            ];
            await db.insertInto('subtasks').values(subtasks).execute();
            const job = {
                id: 'subtask-order-conflict',
                data: {
                    todoId: todo.id,
                    conflictType: 'subtask_ordering',
                    conflictingUpdates: [
                        {
                            deviceId: 'device-1',
                            changes: {
                                subtaskOrdering: [subtasks[1].id, subtasks[0].id, subtasks[2].id], // Swapped first two
                            },
                        },
                        {
                            deviceId: 'device-2',
                            changes: {
                                subtaskOrdering: [subtasks[2].id, subtasks[1].id, subtasks[0].id], // Completely reversed
                            },
                        },
                    ],
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            mockVectorClockService.resolveConcurrentUpdates.mockReturnValue({
                conflictResolution: 'dependency_based_ordering',
                mergedChanges: {
                    subtaskOrdering: [subtasks[0].id, subtasks[1].id, subtasks[2].id], // Logical dependency order
                },
                resolutionReason: 'Resolved based on subtask dependencies',
            });
            const conflictJob = new conflict_resolution_1.ConflictResolutionJob(db, mockVectorClockService);
            const result = await conflictJob.process(job);
            expect(result.success).toBe(true);
            expect(result.resolution).toBe('dependency_based_ordering');
            // Verify subtask order was updated
            const updatedSubtasks = await db
                .selectFrom('subtasks')
                .where('todo_id', '=', todo.id)
                .orderBy('order_index', 'asc')
                .selectAll()
                .execute();
            expect(updatedSubtasks.map(s => s.id)).toEqual([
                subtasks[0].id,
                subtasks[1].id,
                subtasks[2].id,
            ]);
        });
        it('should handle concurrent subtask additions', async () => {
            const db = dbManager.getKysely();
            const job = {
                id: 'concurrent-subtask-addition',
                data: {
                    todoId: 'todo-123',
                    conflictType: 'concurrent_subtask_creation',
                    conflictingUpdates: [
                        {
                            deviceId: 'device-1',
                            changes: {
                                newSubtasks: [
                                    {
                                        title: 'Subtask A from device 1',
                                        orderIndex: 3,
                                    },
                                ],
                            },
                        },
                        {
                            deviceId: 'device-2',
                            changes: {
                                newSubtasks: [
                                    {
                                        title: 'Subtask B from device 2',
                                        orderIndex: 3, // Same position - conflict
                                    },
                                ],
                            },
                        },
                    ],
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            mockVectorClockService.resolveConcurrentUpdates.mockReturnValue({
                conflictResolution: 'reorder_concurrent_additions',
                mergedChanges: {
                    newSubtasks: [
                        { title: 'Subtask A from device 1', orderIndex: 3 },
                        { title: 'Subtask B from device 2', orderIndex: 4 }, // Reordered
                    ],
                },
            });
            const conflictJob = new conflict_resolution_1.ConflictResolutionJob(db, mockVectorClockService);
            const result = await conflictJob.process(job);
            expect(result.success).toBe(true);
            expect(result.resolution).toBe('reorder_concurrent_additions');
            expect(result.subtasksCreated).toBe(2);
        });
    });
    describe('Conflict Resolution Audit', () => {
        it('should create detailed audit trail for conflict resolution', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            await db.insertInto('users').values(user).execute();
            const job = {
                id: 'audit-test-job',
                data: {
                    todoId: 'audit-test-todo',
                    userId: user.id,
                    conflictType: 'concurrent_modification',
                    conflictingUpdates: [
                        {
                            deviceId: 'device-1',
                            changes: { title: 'Title A' },
                            timestamp: new Date('2024-01-01T10:00:00Z'),
                        },
                        {
                            deviceId: 'device-2',
                            changes: { title: 'Title B' },
                            timestamp: new Date('2024-01-01T10:01:00Z'),
                        },
                    ],
                },
                progress: jest.fn(),
                log: jest.fn(),
            };
            mockVectorClockService.resolveConcurrentUpdates.mockReturnValue({
                conflictResolution: 'last_writer_wins',
                mergedChanges: { title: 'Title B' },
                winningDevice: 'device-2',
            });
            const conflictJob = new conflict_resolution_1.ConflictResolutionJob(db, mockVectorClockService);
            await conflictJob.process(job);
            // Verify audit trail was created
            const auditRecord = await db
                .selectFrom('audit_trails')
                .where('entity_id', '=', 'audit-test-todo')
                .where('action', '=', 'conflict_resolved')
                .selectAll()
                .executeTakeFirst();
            expect(auditRecord).toBeTruthy();
            expect(auditRecord?.old_values).toContain('Title A');
            expect(auditRecord?.new_values).toContain('Title B');
            expect(auditRecord?.device_id).toBe('device-2'); // Winning device
            const metadata = JSON.parse(auditRecord?.metadata || '{}');
            expect(metadata).toMatchObject({
                conflictType: 'concurrent_modification',
                resolutionStrategy: 'last_writer_wins',
                conflictingDevices: ['device-1', 'device-2'],
            });
        });
        it('should track conflict resolution statistics', async () => {
            // Process multiple conflicts
            const conflictTypes = [
                'concurrent_modification',
                'non_conflicting_fields',
                'subtask_ordering',
                'content_modification',
            ];
            for (const conflictType of conflictTypes) {
                await conflictResolver.queueConflictResolution({
                    todoId: `test-${conflictType}`,
                    conflictType,
                    resolutionStrategy: 'auto',
                });
            }
            // This should fail - method doesn't exist
            const stats = await conflictResolver.getResolutionStatistics();
            expect(stats).toMatchObject({
                totalConflicts: expect.any(Number),
                resolutionStrategies: expect.objectContaining({
                    auto_merge: expect.any(Number),
                    last_writer_wins: expect.any(Number),
                    intelligent_merge: expect.any(Number),
                    manual_review_required: expect.any(Number),
                }),
                averageResolutionTime: expect.any(Number),
                successRate: expect.any(Number),
                conflictsByType: expect.objectContaining({
                    concurrent_modification: expect.any(Number),
                    non_conflicting_fields: expect.any(Number),
                }),
            });
        });
        it('should alert on high conflict rates', async () => {
            const alertConfig = {
                conflictRateThreshold: 0.1, // 10% of updates result in conflicts
                timeWindow: 3600000, // 1 hour
                minimumUpdates: 50, // At least 50 updates to trigger
            };
            await conflictResolver.configureConflictAlerts(alertConfig);
            // Simulate high conflict rate
            for (let i = 0; i < 60; i++) {
                await conflictResolver.queueConflictResolution({
                    todoId: `high-conflict-${i}`,
                    conflictType: 'concurrent_modification',
                });
            }
            const alerts = await conflictResolver.getActiveAlerts();
            expect(alerts.some(alert => alert.type === 'high_conflict_rate')).toBe(true);
            expect(alerts.find(a => a.type === 'high_conflict_rate')?.severity).toBe('warning');
        });
    });
    describe('Performance and Optimization', () => {
        it('should batch process similar conflicts efficiently', async () => {
            const similarConflicts = [];
            // Create 20 similar conflicts
            for (let i = 0; i < 20; i++) {
                similarConflicts.push({
                    todoId: `batch-todo-${i}`,
                    conflictType: 'non_conflicting_fields',
                    userId: 'batch-user',
                });
            }
            // This should fail - method doesn't exist
            const batchResult = await conflictResolver.batchProcessSimilarConflicts(similarConflicts, {
                maxBatchSize: 10,
                processingStrategy: 'parallel',
            });
            expect(batchResult).toMatchObject({
                totalProcessed: 20,
                batchesCreated: 2,
                averageProcessingTime: expect.any(Number),
                successRate: expect.any(Number),
            });
            // Should process in batches for efficiency
            expect(batchResult.batchesCreated).toBe(2);
        });
        it('should optimize conflict resolution based on patterns', async () => {
            const patterns = [
                { conflictType: 'context_changes', frequency: 50, avgResolutionTime: 200 },
                { conflictType: 'priority_updates', frequency: 30, avgResolutionTime: 150 },
                { conflictType: 'outcome_modifications', frequency: 20, avgResolutionTime: 800 },
            ];
            // This should fail - method doesn't exist
            const optimizations = await conflictResolver.analyzeOptimizationOpportunities(patterns);
            expect(optimizations).toMatchObject({
                recommendations: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'auto_resolution_rule',
                        conflictPattern: 'context_changes',
                        reasoning: expect.stringContaining('high frequency, low complexity'),
                    }),
                ]),
                potentialTimeSavings: expect.any(Number),
                implementationPriority: expect.any(Array),
            });
        });
        it('should handle conflict resolution under high load', async () => {
            const highLoadConfig = {
                maxConcurrentJobs: 10,
                queuePriorityLevels: 3,
                adaptiveRateLimiting: true,
            };
            await conflictResolver.configureHighLoadHandling(highLoadConfig);
            // Simulate high load with many conflicts
            const conflicts = [];
            for (let i = 0; i < 100; i++) {
                conflicts.push({
                    todoId: `load-test-${i}`,
                    conflictType: 'concurrent_modification',
                    priority: Math.floor(Math.random() * 3), // Random priority
                });
            }
            const startTime = Date.now();
            const results = await Promise.all(conflicts.map(conflict => conflictResolver.queueConflictResolution(conflict)));
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            expect(results).toHaveLength(100);
            expect(processingTime).toBeLessThan(10000); // Should handle 100 conflicts in under 10s
            // Verify queue didn't become overwhelmed
            const queueStats = await conflictResolver.getQueueStats();
            expect(queueStats.backlog).toBeLessThan(50); // Reasonable backlog
        });
    });
});
//# sourceMappingURL=sync-conflict-resolution.test.js.map