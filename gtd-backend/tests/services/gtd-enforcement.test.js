"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_db_1 = require("../helpers/test-db");
const factories_1 = require("../helpers/factories");
const gtd_enforcement_1 = require("@/services/gtd-enforcement"); // This will fail - doesn't exist yet
describe('GTD Enforcement Service', () => {
    let dbManager;
    let gtdService;
    let mockLLMService;
    let mockVectorClockService;
    beforeEach(async () => {
        dbManager = new test_db_1.TestDbManager();
        const db = await dbManager.setup();
        // Mock dependencies
        mockLLMService = {
            analyzeTodo: jest.fn(),
            decomposeIntoSubtasks: jest.fn(),
            improveClarity: jest.fn(),
            validateQuality: jest.fn(),
        };
        mockVectorClockService = {
            increment: jest.fn(),
            merge: jest.fn(),
            compare: jest.fn(),
            createNew: jest.fn(),
        };
        // This will fail - service doesn't exist
        gtdService = new gtd_enforcement_1.GTDEnforcementService(db, mockLLMService, mockVectorClockService);
    });
    afterEach(async () => {
        await dbManager.cleanup();
    });
    describe('Outcome Validation', () => {
        it('should validate clear outcome definitions', async () => {
            const validOutcomes = [
                'Success looks like having a completed project proposal with budget approval from the executive team',
                'Success looks like the website loading in under 2 seconds with all functionality working',
                'Success looks like completing the quarterly report with all KPIs documented and presented to stakeholders',
            ];
            for (const outcome of validOutcomes) {
                // This should fail - method doesn't exist
                const result = await gtdService.validateOutcome(outcome);
                expect(result.isValid).toBe(true);
                expect(result.score).toBeGreaterThan(0.8);
            }
        });
        it('should reject vague outcome definitions', async () => {
            const vagueOutcomes = [
                'Get it done',
                'Finish the project',
                'Complete the task',
                'Make it work',
                'Done',
            ];
            for (const outcome of vagueOutcomes) {
                const result = await gtdService.validateOutcome(outcome);
                expect(result.isValid).toBe(false);
                expect(result.score).toBeLessThan(0.5);
                expect(result.suggestions).toContain('Be more specific about what success looks like');
            }
        });
        it('should require "success looks like" pattern for high scores', async () => {
            const withoutPattern = 'The project will be completed and approved';
            const withPattern = 'Success looks like the project being completed and approved by stakeholders';
            const resultWithout = await gtdService.validateOutcome(withoutPattern);
            const resultWith = await gtdService.validateOutcome(withPattern);
            expect(resultWith.score).toBeGreaterThan(resultWithout.score);
        });
        it('should validate outcome measurability', async () => {
            const measurableOutcome = 'Success looks like reducing page load time to under 2 seconds and achieving 95% user satisfaction';
            const unmeasurableOutcome = 'Success looks like making the website better';
            const measurable = await gtdService.validateOutcome(measurableOutcome);
            const unmeasurable = await gtdService.validateOutcome(unmeasurableOutcome);
            expect(measurable.score).toBeGreaterThan(unmeasurable.score);
            expect(unmeasurable.suggestions).toContain('Add measurable criteria');
        });
    });
    describe('Next Action Validation', () => {
        it('should validate specific next actions', async () => {
            const specificActions = [
                'Open the project planning document and review the requirements section',
                'Call John Smith at extension 1234 to discuss budget allocation',
                'Create a new Google Doc titled "Q4 Project Proposal" and add the template sections',
            ];
            for (const action of specificActions) {
                // This should fail - method doesn't exist
                const result = await gtdService.validateNextAction(action);
                expect(result.isValid).toBe(true);
                expect(result.score).toBeGreaterThan(0.8);
            }
        });
        it('should reject vague next actions', async () => {
            const vagueActions = [
                'Work on it',
                'Start the project',
                'Think about it',
                'Research',
                'Plan',
            ];
            for (const action of vagueActions) {
                const result = await gtdService.validateNextAction(action);
                expect(result.isValid).toBe(false);
                expect(result.score).toBeLessThan(0.5);
                expect(result.suggestions).toContain('Be more specific about the exact action to take');
            }
        });
        it('should require action verb at the beginning', async () => {
            const withVerb = 'Call the client to discuss project requirements';
            const withoutVerb = 'The client needs to be called about requirements';
            const resultWith = await gtdService.validateNextAction(withVerb);
            const resultWithout = await gtdService.validateNextAction(withoutVerb);
            expect(resultWith.score).toBeGreaterThan(resultWithout.score);
        });
        it('should validate action feasibility', async () => {
            const feasibleAction = 'Email Sarah at sarah@company.com to schedule a meeting';
            const unfeasibleAction = 'Telepathically communicate with the team about the deadline';
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                actionFeasibility: 0.95,
                suggestions: [],
            });
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                actionFeasibility: 0.1,
                suggestions: ['Use realistic communication methods'],
            });
            const feasible = await gtdService.validateNextAction(feasibleAction);
            const unfeasible = await gtdService.validateNextAction(unfeasibleAction);
            expect(feasible.score).toBeGreaterThan(unfeasible.score);
        });
    });
    describe('Context Validation', () => {
        it('should validate standard GTD contexts', async () => {
            const validContexts = [
                '@computer',
                '@calls',
                '@errands',
                '@office',
                '@home',
                '@waiting',
                '@agenda-john',
                '@read-review',
            ];
            for (const context of validContexts) {
                // This should fail - method doesn't exist
                const result = await gtdService.validateContext(context);
                expect(result.isValid).toBe(true);
            }
        });
        it('should suggest context if missing', async () => {
            const contextlessAction = 'Email the client about project status';
            const result = await gtdService.validateNextAction(contextlessAction);
            expect(result.suggestedContext).toBe('@computer');
        });
        it('should validate context consistency with action', async () => {
            const consistentPairs = [
                { action: 'Call the supplier for quotes', context: '@calls' },
                { action: 'Buy groceries from the store', context: '@errands' },
                { action: 'Review the document draft', context: '@read-review' },
            ];
            for (const { action, context } of consistentPairs) {
                const result = await gtdService.validateActionContextMatch(action, context);
                expect(result.isConsistent).toBe(true);
                expect(result.score).toBeGreaterThan(0.8);
            }
        });
        it('should detect context mismatch', async () => {
            const inconsistentPairs = [
                { action: 'Call the supplier for quotes', context: '@computer' },
                { action: 'Update the Excel spreadsheet', context: '@calls' },
                { action: 'Pick up the dry cleaning', context: '@office' },
            ];
            for (const { action, context } of inconsistentPairs) {
                const result = await gtdService.validateActionContextMatch(action, context);
                expect(result.isConsistent).toBe(false);
                expect(result.suggestedContext).toBeTruthy();
            }
        });
    });
    describe('Quality Scoring', () => {
        it('should calculate comprehensive quality score', async () => {
            const highQualityTodo = {
                title: 'Complete quarterly business review presentation',
                outcome: 'Success looks like delivering a 30-slide presentation to the executive team with Q3 performance metrics and Q4 projections, receiving approval for budget allocation',
                nextAction: 'Open PowerPoint and create new presentation from the QBR template in the shared drive',
                context: '@computer',
                timeEstimate: 240,
                energyLevel: 'high',
            };
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                outcomeClarity: 0.95,
                actionSpecificity: 0.90,
                contextRelevance: 0.88,
                overallQuality: 0.91,
            });
            // This should fail - method doesn't exist
            const result = await gtdService.calculateQualityScore(highQualityTodo);
            expect(result.overallScore).toBeGreaterThan(0.85);
            expect(result.breakdown).toMatchObject({
                outcomeClarity: expect.any(Number),
                actionSpecificity: expect.any(Number),
                contextRelevance: expect.any(Number),
            });
        });
        it('should penalize incomplete GTD structure', async () => {
            const incompleteStructures = [
                {
                    title: 'Work on project',
                    outcome: '', // Missing outcome
                    nextAction: 'Start working',
                },
                {
                    title: 'Complete report',
                    outcome: 'Success looks like finished report',
                    nextAction: '', // Missing next action
                },
                {
                    title: 'Meeting preparation',
                    outcome: 'Ready for meeting',
                    nextAction: 'Prepare', // Vague action
                },
            ];
            for (const todo of incompleteStructures) {
                const result = await gtdService.calculateQualityScore(todo);
                expect(result.overallScore).toBeLessThan(0.5);
                expect(result.suggestions.length).toBeGreaterThan(0);
            }
        });
        it('should provide weighted scoring based on importance', async () => {
            const todo = {
                title: 'Test scoring weights',
                outcome: 'Good outcome definition',
                nextAction: 'Mediocre action',
                context: '@computer',
            };
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                outcomeClarity: 0.9,
                actionSpecificity: 0.5,
                contextRelevance: 0.8,
            });
            const result = await gtdService.calculateQualityScore(todo);
            // Outcome should be weighted more heavily than context
            expect(result.breakdown.outcomeWeight).toBeGreaterThan(result.breakdown.contextWeight);
        });
    });
    describe('Clarification Process', () => {
        it('should guide clarification for unclear todos', async () => {
            const unclearTodo = {
                title: 'Project stuff',
                outcome: 'Get it done',
                nextAction: 'Work on it',
            };
            mockLLMService.improveClarity.mockResolvedValueOnce({
                improvedOutcome: 'Success looks like completing the project deliverables with stakeholder approval',
                improvedNextAction: 'Open the project charter document and review the scope definition',
                suggestions: [
                    'Specify what project you are referring to',
                    'Define what "done" means in measurable terms',
                    'Break down the work into specific actions',
                ],
                clarificationQuestions: [
                    'What specific project are you working on?',
                    'Who are the stakeholders for this project?',
                    'What does completion look like?',
                ],
            });
            // This should fail - method doesn't exist
            const result = await gtdService.clarifyTodo(unclearTodo);
            expect(result.improvedOutcome).toBeTruthy();
            expect(result.improvedNextAction).toBeTruthy();
            expect(result.clarificationQuestions.length).toBeGreaterThan(0);
            expect(result.suggestions.length).toBeGreaterThan(0);
        });
        it('should skip clarification for already clear todos', async () => {
            const clearTodo = {
                title: 'Submit monthly expense report',
                outcome: 'Success looks like submitting the completed expense report to finance by the 5th, with all receipts attached and manager approval',
                nextAction: 'Log into the expense system and create a new report for October 2024',
                context: '@computer',
            };
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                overallQuality: 0.92,
                needsClarification: false,
            });
            const result = await gtdService.clarifyTodo(clearTodo);
            expect(result.needsClarification).toBe(false);
            expect(result.improvedOutcome).toBe(clearTodo.outcome);
            expect(result.improvedNextAction).toBe(clearTodo.nextAction);
        });
        it('should maintain user intent during clarification', async () => {
            const originalTodo = {
                title: 'Email about meeting',
                outcome: 'Sent the email',
                nextAction: 'Send email',
            };
            mockLLMService.improveClarity.mockResolvedValueOnce({
                improvedOutcome: 'Success looks like sending a clear email to the team about next week\'s project meeting with agenda and location details',
                improvedNextAction: 'Open email client and compose message to the project team about the meeting',
                preservedIntent: true,
                intentAnalysis: 'User wants to communicate about a meeting via email',
            });
            const result = await gtdService.clarifyTodo(originalTodo);
            expect(result.preservedIntent).toBe(true);
            expect(result.improvedOutcome).toContain('email');
            expect(result.improvedOutcome).toContain('meeting');
        });
    });
    describe('Quality Gates', () => {
        it('should enforce minimum quality threshold', async () => {
            const poorQualityTodo = {
                title: 'Do stuff',
                outcome: 'Done',
                nextAction: 'Start',
            };
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                overallQuality: 0.2,
            });
            // This should fail - method doesn't exist
            await expect(gtdService.enforceQualityGate(poorQualityTodo)).rejects.toThrow('Todo quality below minimum threshold');
        });
        it('should pass todos above quality threshold', async () => {
            const goodQualityTodo = {
                title: 'Complete monthly financial report',
                outcome: 'Success looks like delivering accurate financial report with variance analysis to the CFO by month-end',
                nextAction: 'Open the financial reporting template and gather October data from the accounting system',
            };
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                overallQuality: 0.96,
            });
            const result = await gtdService.enforceQualityGate(goodQualityTodo);
            expect(result.passed).toBe(true);
            expect(result.quality).toBeGreaterThan(0.95);
        });
        it('should provide improvement suggestions for failing todos', async () => {
            const improvableTodo = {
                title: 'Website update',
                outcome: 'Updated website',
                nextAction: 'Update website',
            };
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                overallQuality: 0.4,
                suggestions: [
                    'Specify what parts of the website need updating',
                    'Define what "updated" means in measurable terms',
                    'Identify the specific first step to take',
                ],
            });
            const result = await gtdService.enforceQualityGate(improvableTodo, { strict: false });
            expect(result.passed).toBe(false);
            expect(result.suggestions.length).toBeGreaterThan(0);
            expect(result.canProceedWithWarning).toBe(true);
        });
        it('should have different thresholds for different contexts', async () => {
            const quickCaptureTodo = {
                title: 'Call mom',
                outcome: 'Talked to mom',
                nextAction: 'Call her',
                context: '@calls',
                captureContext: 'quick-capture',
            };
            const projectTodo = {
                title: 'Launch new product',
                outcome: 'Product launched',
                nextAction: 'Work on launch',
                context: '@office',
                captureContext: 'project-planning',
            };
            // Quick capture should have lower threshold
            const quickResult = await gtdService.enforceQualityGate(quickCaptureTodo, {
                context: 'quick-capture'
            });
            const projectResult = await gtdService.enforceQualityGate(projectTodo, {
                context: 'project-planning'
            });
            expect(quickResult.threshold).toBeLessThan(projectResult.threshold);
        });
    });
    describe('Automatic Re-evaluation', () => {
        it('should schedule re-evaluation for todos below excellence threshold', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo({
                gtd_quality_score: 0.7, // Below excellence but above minimum
            });
            await db.insertInto('todos').values(todo).execute();
            // This should fail - method doesn't exist
            await gtdService.scheduleReEvaluation(todo.id, {
                reason: 'quality_improvement',
                targetScore: 0.95,
                scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            });
            // Verify re-evaluation was scheduled
            const scheduledJobs = await gtdService.getScheduledReEvaluations(todo.user_id);
            expect(scheduledJobs).toHaveLength(1);
            expect(scheduledJobs[0].todoId).toBe(todo.id);
        });
        it('should re-evaluate todos based on context changes', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo({
                context: '@office',
                created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days old
            });
            await db.insertInto('todos').values(todo).execute();
            // Simulate context change (e.g., working from home now)
            const contextChange = {
                oldContext: '@office',
                newContext: '@home',
                reason: 'remote_work_policy',
            };
            mockLLMService.analyzeTodo.mockResolvedValueOnce({
                contextRelevance: 0.3, // Low relevance in new context
                suggestedContext: '@computer',
                adaptationSuggestions: [
                    'This task can be done remotely on computer',
                    'No need to be physically in office',
                ],
            });
            const result = await gtdService.reEvaluateForContextChange(todo.id, contextChange);
            expect(result.needsUpdate).toBe(true);
            expect(result.suggestedContext).toBe('@computer');
        });
        it('should batch re-evaluate multiple todos efficiently', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            await db.insertInto('users').values(user).execute();
            const todos = [];
            for (let i = 0; i < 50; i++) {
                todos.push(factories_1.TestDataFactory.createTodo({
                    user_id: user.id,
                    gtd_quality_score: 0.7 + Math.random() * 0.2, // Between 0.7-0.9
                }));
            }
            await db.insertInto('todos').values(todos).execute();
            const startTime = Date.now();
            const results = await gtdService.batchReEvaluate(todos.map(t => t.id));
            const endTime = Date.now();
            expect(results.length).toBe(50);
            expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
            expect(mockLLMService.analyzeTodo).toHaveBeenCalledTimes(1); // Should batch LLM calls
        });
    });
    describe('Integration with Vector Clock', () => {
        it('should update vector clock on GTD modifications', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo();
            await db.insertInto('todos').values(todo).execute();
            const deviceId = 'device-123';
            const originalClock = JSON.parse(todo.vector_clock);
            mockVectorClockService.increment.mockReturnValueOnce({
                ...originalClock,
                [deviceId]: (originalClock[deviceId] || 0) + 1,
            });
            const updatedTodo = await gtdService.improveAndUpdate(todo.id, {
                deviceId,
                improvements: {
                    outcome: 'Improved outcome with better clarity and specificity',
                    nextAction: 'More specific next action with clear steps',
                },
            });
            expect(mockVectorClockService.increment).toHaveBeenCalledWith(originalClock, deviceId);
            expect(updatedTodo.vectorClock).not.toEqual(todo.vector_clock);
        });
        it('should handle concurrent modifications with vector clocks', async () => {
            const db = dbManager.getKysely();
            const todo = factories_1.TestDataFactory.createTodo();
            await db.insertInto('todos').values(todo).execute();
            const device1 = 'device-1';
            const device2 = 'device-2';
            // Simulate concurrent modifications
            const modification1 = gtdService.improveAndUpdate(todo.id, {
                deviceId: device1,
                improvements: { outcome: 'Modified by device 1' },
            });
            const modification2 = gtdService.improveAndUpdate(todo.id, {
                deviceId: device2,
                improvements: { nextAction: 'Modified by device 2' },
            });
            // Both should complete but may require conflict resolution
            const [result1, result2] = await Promise.allSettled([modification1, modification2]);
            expect(mockVectorClockService.compare).toHaveBeenCalled();
            // At least one should succeed, the other might need conflict resolution
            const successfulResults = [result1, result2].filter(r => r.status === 'fulfilled');
            expect(successfulResults.length).toBeGreaterThanOrEqual(1);
        });
    });
});
//# sourceMappingURL=gtd-enforcement.test.js.map