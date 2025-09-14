"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const msw_trpc_1 = require("msw-trpc");
const node_1 = require("msw/node");
const test_db_1 = require("../helpers/test-db");
const factories_1 = require("../helpers/factories");
describe('Todos API', () => {
    let dbManager;
    let server;
    let trpc;
    let authUser;
    let authToken;
    beforeAll(() => {
        const handlers = (0, msw_trpc_1.createTRPCMsw)();
        server = (0, node_1.setupServer)(...handlers);
        server.listen();
    });
    beforeEach(async () => {
        dbManager = new test_db_1.TestDbManager();
        const db = await dbManager.setup();
        // Create authenticated user for tests
        authUser = factories_1.TestDataFactory.createUser();
        await db.insertInto('users').values(authUser).execute();
        // Mock authentication token
        authToken = 'mock-jwt-token';
        trpc = (0, msw_trpc_1.createTRPCMsw)({
            baseUrl: 'http://localhost:3000/trpc',
            headers: {
                authorization: `Bearer ${authToken}`,
            },
        });
    });
    afterEach(async () => {
        await dbManager.cleanup();
        server.resetHandlers();
    });
    afterAll(() => {
        server.close();
    });
    describe('Todo CRUD Operations', () => {
        describe('Create Todo', () => {
            it('should create a new todo with valid GTD data', async () => {
                const todoData = {
                    title: 'Complete project proposal',
                    description: 'Write and submit the Q4 project proposal with budget analysis',
                    outcome: 'Success looks like having an approved project proposal with allocated budget',
                    nextAction: 'Open the project template document and review requirements',
                    context: '@computer',
                    priority: 'high',
                    energyLevel: 'high',
                    timeEstimate: 120, // minutes
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                };
                // This should fail - mutation doesn't exist
                const result = await trpc.todos.create.mutate(todoData);
                expect(result).toMatchObject({
                    id: expect.any(String),
                    userId: authUser.id,
                    title: todoData.title,
                    outcome: todoData.outcome,
                    nextAction: todoData.nextAction,
                    clarified: true,
                    gtdQualityScore: expect.any(Number),
                    completed: false,
                });
                expect(result.gtdQualityScore).toBeGreaterThan(0.8); // Should have high quality score
            });
            it('should fail to create todo without outcome', async () => {
                const invalidTodoData = {
                    title: 'Incomplete todo',
                    description: 'This todo lacks proper GTD structure',
                    nextAction: 'Do something',
                    // Missing outcome
                };
                // This should fail - validation should catch missing outcome
                await expect(trpc.todos.create.mutate(invalidTodoData)).rejects.toThrow('BAD_REQUEST');
            });
            it('should fail to create todo without next action', async () => {
                const invalidTodoData = {
                    title: 'Another incomplete todo',
                    outcome: 'Success looks like completion',
                    // Missing nextAction
                };
                await expect(trpc.todos.create.mutate(invalidTodoData)).rejects.toThrow('BAD_REQUEST');
            });
            it('should automatically trigger LLM analysis for unclear todos', async () => {
                const unclearTodoData = {
                    title: 'Work on stuff',
                    outcome: 'Get it done',
                    nextAction: 'Start working',
                };
                // Mock LLM service response
                server.use(trpc.llm.analyzeTodo.mutation((req, res, ctx) => {
                    return res(ctx.json({
                        clarified: false,
                        qualityScore: 0.3,
                        suggestions: [
                            'Define what "stuff" specifically refers to',
                            'Clarify what "done" means in measurable terms',
                            'Specify the exact first action to take',
                        ],
                    }));
                }));
                // This should fail - LLM integration doesn't exist
                const result = await trpc.todos.create.mutate(unclearTodoData);
                expect(result.clarified).toBe(false);
                expect(result.gtdQualityScore).toBeLessThan(0.5);
            });
            it('should validate priority enum values', async () => {
                const todoData = {
                    title: 'Test todo',
                    outcome: 'Success looks like validation working',
                    nextAction: 'Submit the request',
                    priority: 'invalid-priority',
                };
                await expect(trpc.todos.create.mutate(todoData)).rejects.toThrow('BAD_REQUEST');
            });
            it('should validate energy level enum values', async () => {
                const todoData = {
                    title: 'Test todo',
                    outcome: 'Success looks like validation working',
                    nextAction: 'Submit the request',
                    energyLevel: 'extreme',
                };
                await expect(trpc.todos.create.mutate(todoData)).rejects.toThrow('BAD_REQUEST');
            });
        });
        describe('Read Todos', () => {
            it('should list todos for authenticated user', async () => {
                const db = dbManager.getKysely();
                // Create test todos
                const todo1 = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                const todo2 = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                const otherUserTodo = factories_1.TestDataFactory.createTodo(); // Different user
                await db.insertInto('todos').values([todo1, todo2, otherUserTodo]).execute();
                // This should fail - query doesn't exist
                const result = await trpc.todos.list.query();
                expect(result).toHaveLength(2);
                expect(result.every(todo => todo.userId === authUser.id)).toBe(true);
                expect(result.map(t => t.id)).toContain(todo1.id);
                expect(result.map(t => t.id)).toContain(todo2.id);
                expect(result.map(t => t.id)).not.toContain(otherUserTodo.id);
            });
            it('should filter todos by completion status', async () => {
                const db = dbManager.getKysely();
                const completedTodo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    completed: true
                });
                const incompleteTodo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    completed: false
                });
                await db.insertInto('todos').values([completedTodo, incompleteTodo]).execute();
                // This should fail - query doesn't exist
                const completedResult = await trpc.todos.list.query({
                    filter: { completed: true }
                });
                const incompleteResult = await trpc.todos.list.query({
                    filter: { completed: false }
                });
                expect(completedResult).toHaveLength(1);
                expect(completedResult[0].completed).toBe(true);
                expect(incompleteResult).toHaveLength(1);
                expect(incompleteResult[0].completed).toBe(false);
            });
            it('should filter todos by priority', async () => {
                const db = dbManager.getKysely();
                const highPriorityTodo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    priority: 'high'
                });
                const lowPriorityTodo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    priority: 'low'
                });
                await db.insertInto('todos').values([highPriorityTodo, lowPriorityTodo]).execute();
                const result = await trpc.todos.list.query({
                    filter: { priority: 'high' }
                });
                expect(result).toHaveLength(1);
                expect(result[0].priority).toBe('high');
            });
            it('should filter todos by context', async () => {
                const db = dbManager.getKysely();
                const computerTodo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    context: '@computer'
                });
                const callTodo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    context: '@calls'
                });
                await db.insertInto('todos').values([computerTodo, callTodo]).execute();
                const result = await trpc.todos.list.query({
                    filter: { context: '@computer' }
                });
                expect(result).toHaveLength(1);
                expect(result[0].context).toBe('@computer');
            });
            it('should sort todos by due date', async () => {
                const db = dbManager.getKysely();
                const todo1 = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    due_date: new Date('2024-12-01')
                });
                const todo2 = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    due_date: new Date('2024-11-01')
                });
                await db.insertInto('todos').values([todo1, todo2]).execute();
                const result = await trpc.todos.list.query({
                    sort: { field: 'dueDate', order: 'asc' }
                });
                expect(result[0].dueDate).toBeBefore(result[1].dueDate);
            });
            it('should get todo by ID', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                await db.insertInto('todos').values(todo).execute();
                // This should fail - query doesn't exist
                const result = await trpc.todos.getById.query({ id: todo.id });
                expect(result).toMatchObject({
                    id: todo.id,
                    title: todo.title,
                    userId: authUser.id,
                });
            });
            it('should not allow accessing other users todos', async () => {
                const db = dbManager.getKysely();
                const otherUserTodo = factories_1.TestDataFactory.createTodo(); // Different user
                await db.insertInto('todos').values(otherUserTodo).execute();
                await expect(trpc.todos.getById.query({ id: otherUserTodo.id })).rejects.toThrow('NOT_FOUND');
            });
        });
        describe('Update Todo', () => {
            it('should update todo with valid data', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                await db.insertInto('todos').values(todo).execute();
                const updateData = {
                    title: 'Updated todo title',
                    outcome: 'Updated success criteria with more specific deliverables',
                    priority: 'urgent',
                };
                // This should fail - mutation doesn't exist
                const result = await trpc.todos.update.mutate({
                    id: todo.id,
                    ...updateData,
                });
                expect(result).toMatchObject({
                    id: todo.id,
                    title: updateData.title,
                    outcome: updateData.outcome,
                    priority: updateData.priority,
                });
            });
            it('should update vector clock on modification', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                await db.insertInto('todos').values(todo).execute();
                const result = await trpc.todos.update.mutate({
                    id: todo.id,
                    title: 'Updated title',
                    deviceId: 'test-device-123',
                });
                // Vector clock should be updated
                const originalVectorClock = JSON.parse(todo.vector_clock);
                const updatedVectorClock = JSON.parse(result.vectorClock);
                expect(updatedVectorClock['test-device-123']).toBeGreaterThan(originalVectorClock['test-device-123'] || 0);
            });
            it('should trigger GTD re-analysis on significant changes', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                await db.insertInto('todos').values(todo).execute();
                // Mock LLM re-analysis
                server.use(trpc.llm.analyzeTodo.mutation((req, res, ctx) => {
                    return res(ctx.json({
                        qualityScore: 0.92,
                        suggestions: ['Consider adding time estimate'],
                    }));
                }));
                const result = await trpc.todos.update.mutate({
                    id: todo.id,
                    outcome: 'Completely new outcome definition with different success criteria',
                });
                // Quality score should be recalculated
                expect(result.gtdQualityScore).not.toBe(todo.gtd_quality_score);
            });
            it('should not allow updating other users todos', async () => {
                const db = dbManager.getKysely();
                const otherUserTodo = factories_1.TestDataFactory.createTodo();
                await db.insertInto('todos').values(otherUserTodo).execute();
                await expect(trpc.todos.update.mutate({
                    id: otherUserTodo.id,
                    title: 'Unauthorized update',
                })).rejects.toThrow('NOT_FOUND');
            });
        });
        describe('Delete Todo', () => {
            it('should delete todo and cascade to subtasks', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                await db.insertInto('todos').values(todo).execute();
                const subtask = factories_1.TestDataFactory.createSubtask({ todo_id: todo.id });
                await db.insertInto('subtasks').values(subtask).execute();
                // This should fail - mutation doesn't exist
                await trpc.todos.delete.mutate({ id: todo.id });
                // Todo should be deleted
                const deletedTodo = await db
                    .selectFrom('todos')
                    .where('id', '=', todo.id)
                    .selectAll()
                    .executeTakeFirst();
                expect(deletedTodo).toBeUndefined();
                // Subtasks should be cascade deleted
                const deletedSubtasks = await db
                    .selectFrom('subtasks')
                    .where('todo_id', '=', todo.id)
                    .selectAll()
                    .execute();
                expect(deletedSubtasks).toHaveLength(0);
            });
            it('should not allow deleting other users todos', async () => {
                const db = dbManager.getKysely();
                const otherUserTodo = factories_1.TestDataFactory.createTodo();
                await db.insertInto('todos').values(otherUserTodo).execute();
                await expect(trpc.todos.delete.mutate({ id: otherUserTodo.id })).rejects.toThrow('NOT_FOUND');
            });
        });
        describe('Complete/Uncomplete Todo', () => {
            it('should mark todo as completed', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    completed: false
                });
                await db.insertInto('todos').values(todo).execute();
                // This should fail - mutation doesn't exist
                const result = await trpc.todos.complete.mutate({ id: todo.id });
                expect(result.completed).toBe(true);
                expect(result.completedAt).toBeTruthy();
            });
            it('should mark todo as incomplete', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({
                    user_id: authUser.id,
                    completed: true
                });
                await db.insertInto('todos').values(todo).execute();
                const result = await trpc.todos.uncomplete.mutate({ id: todo.id });
                expect(result.completed).toBe(false);
                expect(result.completedAt).toBeNull();
            });
            it('should auto-complete parent todo when all subtasks completed', async () => {
                const db = dbManager.getKysely();
                const todo = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
                await db.insertInto('todos').values(todo).execute();
                const subtask1 = factories_1.TestDataFactory.createSubtask({
                    todo_id: todo.id,
                    completed: true
                });
                const subtask2 = factories_1.TestDataFactory.createSubtask({
                    todo_id: todo.id,
                    completed: false
                });
                await db.insertInto('subtasks').values([subtask1, subtask2]).execute();
                // Complete the last subtask
                const result = await trpc.subtasks.complete.mutate({ id: subtask2.id });
                // Parent todo should be auto-completed
                const updatedTodo = await db
                    .selectFrom('todos')
                    .where('id', '=', todo.id)
                    .selectAll()
                    .executeTakeFirst();
                expect(updatedTodo?.completed).toBe(true);
            });
        });
    });
    describe('GTD Quality Enforcement', () => {
        it('should reject todos below quality threshold', async () => {
            const poorQualityTodo = {
                title: 'Do stuff',
                outcome: 'Done',
                nextAction: 'Start',
            };
            // Mock LLM analysis returning poor quality score
            server.use(trpc.llm.analyzeTodo.mutation((req, res, ctx) => {
                return res(ctx.json({
                    qualityScore: 0.2, // Below threshold
                    clarified: false,
                }));
            }));
            await expect(trpc.todos.create.mutate(poorQualityTodo)).rejects.toThrow('BAD_REQUEST');
        });
        it('should suggest improvements for low-quality todos', async () => {
            const improvableTodo = {
                title: 'Write report',
                outcome: 'Report is finished',
                nextAction: 'Write the report',
            };
            // Mock LLM analysis
            server.use(trpc.llm.analyzeTodo.mutation((req, res, ctx) => {
                return res(ctx.json({
                    qualityScore: 0.7,
                    clarified: true,
                    suggestions: [
                        'Specify what type of report and for whom',
                        'Define what "finished" means (reviewed, approved, sent?)',
                        'Break down writing into specific sections or steps',
                    ],
                }));
            }));
            const result = await trpc.todos.create.mutate(improvableTodo);
            expect(result.suggestions).toBeDefined();
            expect(result.suggestions.length).toBeGreaterThan(0);
        });
        it('should validate outcome specificity', async () => {
            const vagueOutcomeTodo = {
                title: 'Project work',
                outcome: 'Project done',
                nextAction: 'Work on project',
            };
            // This should fail validation
            await expect(trpc.todos.create.mutate(vagueOutcomeTodo)).rejects.toThrow('Outcome must be more specific');
        });
        it('should validate next action actionability', async () => {
            const vagueActionTodo = {
                title: 'Research topic',
                outcome: 'Success looks like understanding the topic completely',
                nextAction: 'Research', // Too vague
            };
            await expect(trpc.todos.create.mutate(vagueActionTodo)).rejects.toThrow('Next action must be more specific');
        });
    });
    describe('Real-time Subscriptions', () => {
        it('should subscribe to todo updates', async () => {
            // This should fail - subscription doesn't exist
            const subscription = trpc.todos.onChange.subscribe({
                userId: authUser.id,
            });
            const updates = [];
            subscription.on('data', (data) => {
                updates.push(data);
            });
            // Create a todo to trigger update
            await trpc.todos.create.mutate({
                title: 'Real-time test',
                outcome: 'Success looks like receiving real-time updates',
                nextAction: 'Create the todo and observe the subscription',
            });
            // Wait for subscription update
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(updates).toHaveLength(1);
            expect(updates[0]).toMatchObject({
                type: 'created',
                data: expect.objectContaining({
                    title: 'Real-time test',
                }),
            });
        });
        it('should not receive updates for other users todos', async () => {
            const subscription = trpc.todos.onChange.subscribe({
                userId: authUser.id,
            });
            const updates = [];
            subscription.on('data', (data) => {
                updates.push(data);
            });
            // Create todo for different user
            const otherUser = factories_1.TestDataFactory.createUser();
            const db = dbManager.getKysely();
            await db.insertInto('users').values(otherUser).execute();
            // This operation should not trigger subscription
            await trpc.todos.create.mutate({
                title: 'Other user todo',
                outcome: 'Should not be received',
                nextAction: 'Create todo for different user',
            }, {
                context: { userId: otherUser.id }, // Different user context
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(updates).toHaveLength(0);
        });
    });
    describe('Audit Trail', () => {
        it('should create audit trail for todo operations', async () => {
            const db = dbManager.getKysely();
            // Create todo
            const result = await trpc.todos.create.mutate({
                title: 'Audit test todo',
                outcome: 'Success looks like proper audit trail creation',
                nextAction: 'Create the todo and verify audit trail',
            });
            // Check audit trail
            const auditTrail = await db
                .selectFrom('audit_trails')
                .where('entity_type', '=', 'todo')
                .where('entity_id', '=', result.id)
                .where('action', '=', 'create')
                .selectAll()
                .executeTakeFirst();
            expect(auditTrail).toBeTruthy();
            expect(auditTrail?.user_id).toBe(authUser.id);
            expect(auditTrail?.new_values).toContain('Audit test todo');
        });
        it('should track todo completion in audit trail', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo({ user_id: authUser.id });
            await db.insertInto('todos').values(todo).execute();
            await trpc.todos.complete.mutate({ id: todo.id });
            const auditTrail = await db
                .selectFrom('audit_trails')
                .where('entity_type', '=', 'todo')
                .where('entity_id', '=', todo.id)
                .where('action', '=', 'complete')
                .selectAll()
                .executeTakeFirst();
            expect(auditTrail).toBeTruthy();
        });
    });
});
//# sourceMappingURL=todos.test.js.map