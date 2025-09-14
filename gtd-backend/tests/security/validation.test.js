"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_db_1 = require("../helpers/test-db");
const validation_1 = require("@/services/validation"); // This will fail - doesn't exist yet
const sanitizer_1 = require("@/security/sanitizer"); // This will fail - doesn't exist yet
describe('Input Validation and Sanitization', () => {
    let dbManager;
    let validationService;
    let sanitizer;
    beforeEach(async () => {
        dbManager = new test_db_1.TestDbManager();
        const db = await dbManager.setup();
        // This will fail - services don't exist
        validationService = new validation_1.ValidationService();
        sanitizer = new sanitizer_1.InputSanitizer();
    });
    afterEach(async () => {
        await dbManager.cleanup();
    });
    describe('Todo Input Validation', () => {
        it('should validate todo creation schema', async () => {
            const validTodoData = {
                title: 'Complete project proposal',
                description: 'Write and submit Q4 project proposal',
                outcome: 'Success looks like approved project proposal with budget allocation',
                nextAction: 'Open template document and review requirements',
                context: '@computer',
                priority: 'high',
                energyLevel: 'medium',
                timeEstimate: 120,
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            };
            // This should fail - schema doesn't exist
            const result = await validationService.validateTodoInput(validTodoData);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(validTodoData);
        });
        it('should reject todos with invalid title', async () => {
            const invalidTitles = [
                '', // Empty title
                ' ', // Whitespace only
                'a'.repeat(501), // Too long (over 500 chars)
                null,
                undefined,
                123, // Wrong type
            ];
            for (const title of invalidTitles) {
                const todoData = {
                    title,
                    outcome: 'Success looks like valid outcome',
                    nextAction: 'Take specific action',
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(false);
                expect(result.error.issues).toContainEqual(expect.objectContaining({
                    path: ['title'],
                    code: expect.any(String),
                }));
            }
        });
        it('should reject todos with invalid outcome', async () => {
            const invalidOutcomes = [
                '', // Empty
                'Done', // Too vague (under 10 chars)
                'a'.repeat(2001), // Too long (over 2000 chars)
                'Just finish it', // Doesn't follow GTD pattern
            ];
            for (const outcome of invalidOutcomes) {
                const todoData = {
                    title: 'Valid title',
                    outcome,
                    nextAction: 'Take specific action',
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(false);
                expect(result.error.issues.some((issue) => issue.path.includes('outcome'))).toBe(true);
            }
        });
        it('should reject todos with invalid next action', async () => {
            const invalidActions = [
                '', // Empty
                'Do it', // Too vague
                'a'.repeat(1001), // Too long (over 1000 chars)
                'maybe think about starting', // Not actionable
            ];
            for (const nextAction of invalidActions) {
                const todoData = {
                    title: 'Valid title',
                    outcome: 'Success looks like completed task with clear deliverables',
                    nextAction,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(false);
                expect(result.error.issues.some((issue) => issue.path.includes('nextAction'))).toBe(true);
            }
        });
        it('should validate priority enum values', async () => {
            const validPriorities = ['low', 'medium', 'high', 'urgent'];
            const invalidPriorities = ['super-high', 'URGENT', 'critical', 123, null];
            for (const priority of validPriorities) {
                const todoData = {
                    title: 'Test priority validation',
                    outcome: 'Success looks like valid priority accepted',
                    nextAction: 'Submit with valid priority',
                    priority,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(true);
            }
            for (const priority of invalidPriorities) {
                const todoData = {
                    title: 'Test priority validation',
                    outcome: 'Success looks like invalid priority rejected',
                    nextAction: 'Submit with invalid priority',
                    priority,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(false);
                expect(result.error.issues.some((issue) => issue.path.includes('priority'))).toBe(true);
            }
        });
        it('should validate energy level enum values', async () => {
            const validEnergyLevels = ['low', 'medium', 'high'];
            const invalidEnergyLevels = ['extreme', 'maximum', 'MEDIUM', 0, null];
            for (const energyLevel of validEnergyLevels) {
                const todoData = {
                    title: 'Test energy level validation',
                    outcome: 'Success looks like valid energy level accepted',
                    nextAction: 'Submit with valid energy level',
                    energyLevel,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(true);
            }
            for (const energyLevel of invalidEnergyLevels) {
                const todoData = {
                    title: 'Test energy level validation',
                    outcome: 'Success looks like invalid energy level rejected',
                    nextAction: 'Submit with invalid energy level',
                    energyLevel,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(false);
            }
        });
        it('should validate time estimate constraints', async () => {
            const validTimeEstimates = [1, 30, 480, 960]; // 1 minute to 16 hours
            const invalidTimeEstimates = [0, -10, 1441, 'thirty', null]; // Over 24 hours or invalid
            for (const timeEstimate of validTimeEstimates) {
                const todoData = {
                    title: 'Test time estimate',
                    outcome: 'Success looks like valid time estimate accepted',
                    nextAction: 'Submit with valid time estimate',
                    timeEstimate,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(true);
            }
            for (const timeEstimate of invalidTimeEstimates) {
                const todoData = {
                    title: 'Test time estimate',
                    outcome: 'Success looks like invalid time estimate rejected',
                    nextAction: 'Submit with invalid time estimate',
                    timeEstimate,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(false);
            }
        });
        it('should validate due date constraints', async () => {
            const now = new Date();
            const validDueDates = [
                new Date(now.getTime() + 60000), // 1 minute in future
                new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000), // 1 year in future
            ];
            const invalidDueDates = [
                new Date(now.getTime() - 60000), // In the past
                new Date(now.getTime() + 5 * 365 * 24 * 60 * 60 * 1000), // More than 5 years ahead
                'tomorrow', // String instead of Date
                123456789, // Number instead of Date
            ];
            for (const dueDate of validDueDates) {
                const todoData = {
                    title: 'Test due date',
                    outcome: 'Success looks like valid due date accepted',
                    nextAction: 'Submit with valid due date',
                    dueDate,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(true);
            }
            for (const dueDate of invalidDueDates) {
                const todoData = {
                    title: 'Test due date',
                    outcome: 'Success looks like invalid due date rejected',
                    nextAction: 'Submit with invalid due date',
                    dueDate,
                };
                const result = await validationService.validateTodoInput(todoData);
                expect(result.success).toBe(false);
            }
        });
    });
    describe('Input Sanitization', () => {
        it('should sanitize XSS attempts in text fields', async () => {
            const xssPayloads = [
                '<script>alert("XSS")</script>',
                '<img src=x onerror=alert("XSS")>',
                '<svg onload=alert("XSS")>',
                'javascript:alert("XSS")',
                '"><script>alert("XSS")</script>',
                '<iframe src="javascript:alert(\'XSS\')"></iframe>',
            ];
            for (const payload of xssPayloads) {
                const todoData = {
                    title: payload,
                    description: payload,
                    outcome: `Success looks like ${payload} sanitized`,
                    nextAction: `Clean the ${payload} from input`,
                };
                // This should fail - method doesn't exist
                const sanitized = await sanitizer.sanitizeTodoInput(todoData);
                expect(sanitized.title).not.toContain('<script>');
                expect(sanitized.title).not.toContain('javascript:');
                expect(sanitized.title).not.toContain('onerror');
                expect(sanitized.title).not.toContain('onload');
                expect(sanitized.description).not.toContain('<script>');
                expect(sanitized.outcome).not.toContain('<script>');
                expect(sanitized.nextAction).not.toContain('<script>');
            }
        });
        it('should preserve safe HTML formatting if allowed', async () => {
            const safeFormatting = {
                title: 'Project **important** task',
                description: 'This is *emphasized* text with a [link](https://example.com)',
                outcome: 'Success looks like **completed** task',
                nextAction: 'Open *specific* document',
            };
            const sanitized = await sanitizer.sanitizeTodoInput(safeFormatting, { allowMarkdown: true });
            // Markdown should be preserved if allowed
            expect(sanitized.title).toContain('**important**');
            expect(sanitized.description).toContain('[link]');
            expect(sanitized.outcome).toContain('**completed**');
        });
        it('should handle SQL injection attempts', async () => {
            const sqlPayloads = [
                "'; DROP TABLE todos; --",
                "' OR '1'='1",
                "admin'--",
                "'; INSERT INTO todos VALUES ('hacked'); --",
                "' UNION SELECT * FROM users WHERE '1'='1",
            ];
            for (const payload of sqlPayloads) {
                const todoData = {
                    title: `Normal title ${payload}`,
                    outcome: `Success looks like ${payload} handled safely`,
                    nextAction: `Process ${payload} securely`,
                };
                const sanitized = await sanitizer.sanitizeTodoInput(todoData);
                // SQL injection characters should be escaped or removed
                expect(sanitized.title).not.toContain("'; DROP");
                expect(sanitized.outcome).not.toContain("' OR '1'='1");
                expect(sanitized.nextAction).not.toContain('--');
            }
        });
        it('should normalize Unicode and handle encoding attacks', async () => {
            const unicodePayloads = [
                'café', // Normal accented characters
                '��𝕊𝕊', // Mathematical script characters
                '\u003cscript\u003e', // Unicode-encoded script tag
                'ＳＣＲＩＰＴjavascript:alert(1)', // Fullwidth characters
                '\u0000alert("null byte")', // Null byte injection
            ];
            for (const payload of unicodePayloads) {
                const todoData = {
                    title: `Task with ${payload}`,
                    outcome: `Success looks like ${payload} normalized`,
                    nextAction: `Handle ${payload} properly`,
                };
                const sanitized = await sanitizer.sanitizeTodoInput(todoData);
                // Should normalize to safe representation
                expect(sanitized.title).toBeDefined();
                expect(sanitized.title).not.toContain('\u0000'); // No null bytes
                expect(sanitized.title).not.toContain('\u003c'); // No encoded tags
            }
        });
        it('should validate and sanitize context tags', async () => {
            const contextInputs = [
                '@computer', // Valid
                '@calls', // Valid
                '@<script>alert("xss")</script>', // XSS attempt
                '@; DROP TABLE todos; --', // SQL injection
                '@вычисления', // Unicode context
                '@very-long-context-name-that-exceeds-normal-limits-and-should-be-truncated',
            ];
            for (const context of contextInputs) {
                const sanitized = await sanitizer.sanitizeContext(context);
                // Should start with @ and be safe
                expect(sanitized).toMatch(/^@[a-zA-Z0-9\-_]+$/);
                expect(sanitized).not.toContain('<script>');
                expect(sanitized).not.toContain('DROP TABLE');
                expect(sanitized.length).toBeLessThanOrEqual(50); // Reasonable limit
            }
        });
    });
    describe('Business Logic Validation', () => {
        it('should enforce GTD outcome patterns', async () => {
            const outcomes = [
                {
                    value: 'Success looks like completed project with stakeholder approval',
                    shouldPass: true,
                },
                {
                    value: 'The project will be done when finished',
                    shouldPass: false, // Doesn't use "Success looks like" pattern
                },
                {
                    value: 'Success looks like done',
                    shouldPass: false, // Too vague
                },
                {
                    value: 'Success looks like the quarterly report being completed, reviewed by manager, and submitted to finance team by the 15th with all supporting documentation',
                    shouldPass: true, // Specific and measurable
                },
            ];
            for (const { value, shouldPass } of outcomes) {
                // This should fail - method doesn't exist
                const result = await validationService.validateGTDOutcome(value);
                if (shouldPass) {
                    expect(result.isValid).toBe(true);
                    expect(result.score).toBeGreaterThan(0.7);
                }
                else {
                    expect(result.isValid).toBe(false);
                    expect(result.score).toBeLessThan(0.7);
                }
            }
        });
        it('should enforce actionable next actions', async () => {
            const nextActions = [
                {
                    value: 'Call John at 555-1234 to discuss project timeline',
                    shouldPass: true,
                },
                {
                    value: 'Think about the project',
                    shouldPass: false, // Not actionable
                },
                {
                    value: 'work on stuff',
                    shouldPass: false, // Too vague and lowercase
                },
                {
                    value: 'Open Microsoft Word, create new document, and draft the introduction section using the template',
                    shouldPass: true, // Very specific and actionable
                },
            ];
            for (const { value, shouldPass } of nextActions) {
                const result = await validationService.validateNextAction(value);
                if (shouldPass) {
                    expect(result.isActionable).toBe(true);
                    expect(result.score).toBeGreaterThan(0.7);
                }
                else {
                    expect(result.isActionable).toBe(false);
                    expect(result.score).toBeLessThan(0.7);
                }
            }
        });
        it('should validate context consistency', async () => {
            const actionContextPairs = [
                {
                    action: 'Call the supplier for pricing quotes',
                    context: '@calls',
                    shouldMatch: true,
                },
                {
                    action: 'Update the Excel spreadsheet with new data',
                    context: '@computer',
                    shouldMatch: true,
                },
                {
                    action: 'Call the client about the proposal',
                    context: '@computer',
                    shouldMatch: false, // Action needs phone, context is computer
                },
                {
                    action: 'Buy groceries from the store',
                    context: '@errands',
                    shouldMatch: true,
                },
            ];
            for (const { action, context, shouldMatch } of actionContextPairs) {
                const result = await validationService.validateActionContextMatch(action, context);
                if (shouldMatch) {
                    expect(result.isConsistent).toBe(true);
                    expect(result.confidenceScore).toBeGreaterThan(0.7);
                }
                else {
                    expect(result.isConsistent).toBe(false);
                    expect(result.suggestedContext).toBeTruthy();
                }
            }
        });
        it('should validate time estimates for reasonableness', async () => {
            const taskTimeEstimates = [
                {
                    task: 'Send a quick email to colleague',
                    estimate: 5, // minutes
                    shouldPass: true,
                },
                {
                    task: 'Write comprehensive quarterly report',
                    estimate: 2, // Too short for complex task
                    shouldPass: false,
                },
                {
                    task: 'Call to confirm meeting time',
                    estimate: 120, // Too long for simple call
                    shouldPass: false,
                },
                {
                    task: 'Develop new feature with testing',
                    estimate: 480, // 8 hours - reasonable for complex work
                    shouldPass: true,
                },
            ];
            for (const { task, estimate, shouldPass } of taskTimeEstimates) {
                const result = await validationService.validateTimeEstimate(task, estimate);
                if (shouldPass) {
                    expect(result.isReasonable).toBe(true);
                    expect(result.confidenceScore).toBeGreaterThan(0.6);
                }
                else {
                    expect(result.isReasonable).toBe(false);
                    expect(result.suggestedRange).toBeDefined();
                }
            }
        });
    });
    describe('Rate Limiting Validation', () => {
        it('should validate rate limiting parameters', async () => {
            const rateLimitConfigs = [
                {
                    windowMs: 900000, // 15 minutes
                    maxRequests: 100,
                    shouldPass: true,
                },
                {
                    windowMs: -1, // Invalid negative window
                    maxRequests: 100,
                    shouldPass: false,
                },
                {
                    windowMs: 900000,
                    maxRequests: 0, // Invalid zero requests
                    shouldPass: false,
                },
                {
                    windowMs: 86400000, // 24 hours
                    maxRequests: 10000, // Very high limit
                    shouldPass: true,
                },
            ];
            for (const { windowMs, maxRequests, shouldPass } of rateLimitConfigs) {
                const config = { windowMs, maxRequests };
                // This should fail - method doesn't exist
                const result = await validationService.validateRateLimitConfig(config);
                if (shouldPass) {
                    expect(result.isValid).toBe(true);
                }
                else {
                    expect(result.isValid).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                }
            }
        });
    });
    describe('Data Integrity Validation', () => {
        it('should validate vector clock format', async () => {
            const vectorClocks = [
                {
                    value: JSON.stringify({ 'device-1': 5, 'device-2': 3 }),
                    shouldPass: true,
                },
                {
                    value: 'invalid-json',
                    shouldPass: false,
                },
                {
                    value: JSON.stringify({ 'device-1': -1 }), // Negative clock value
                    shouldPass: false,
                },
                {
                    value: JSON.stringify({}), // Empty clock is valid
                    shouldPass: true,
                },
                {
                    value: JSON.stringify({ '': 5 }), // Empty device ID
                    shouldPass: false,
                },
            ];
            for (const { value, shouldPass } of vectorClocks) {
                // This should fail - method doesn't exist
                const result = await validationService.validateVectorClock(value);
                if (shouldPass) {
                    expect(result.isValid).toBe(true);
                }
                else {
                    expect(result.isValid).toBe(false);
                    expect(result.error).toBeDefined();
                }
            }
        });
        it('should validate audit trail data integrity', async () => {
            const auditData = [
                {
                    entityType: 'todo',
                    action: 'create',
                    userId: 'user-123',
                    oldValues: null,
                    newValues: JSON.stringify({ title: 'New todo' }),
                    shouldPass: true,
                },
                {
                    entityType: 'invalid-entity', // Invalid entity type
                    action: 'create',
                    userId: 'user-123',
                    newValues: JSON.stringify({ title: 'New todo' }),
                    shouldPass: false,
                },
                {
                    entityType: 'todo',
                    action: 'update',
                    userId: 'user-123',
                    oldValues: 'invalid-json', // Invalid JSON
                    newValues: JSON.stringify({ title: 'Updated' }),
                    shouldPass: false,
                },
            ];
            for (const { shouldPass, ...data } of auditData) {
                const result = await validationService.validateAuditTrailData(data);
                if (shouldPass) {
                    expect(result.isValid).toBe(true);
                }
                else {
                    expect(result.isValid).toBe(false);
                    expect(result.violations.length).toBeGreaterThan(0);
                }
            }
        });
    });
    describe('Cross-Field Validation', () => {
        it('should validate consistency between related fields', async () => {
            const todoData = [
                {
                    data: {
                        title: 'Call client about proposal',
                        nextAction: 'Call John at extension 1234 to discuss proposal terms',
                        context: '@calls',
                    },
                    shouldPass: true, // All fields are consistent
                },
                {
                    data: {
                        title: 'Update spreadsheet',
                        nextAction: 'Call the finance team',
                        context: '@computer',
                    },
                    shouldPass: false, // Next action doesn't match title or context
                },
                {
                    data: {
                        title: 'Research market trends',
                        nextAction: 'Open web browser and search for industry reports',
                        context: '@computer',
                        timeEstimate: 5, // Too short for research task
                    },
                    shouldPass: false, // Time estimate doesn't match complexity
                },
            ];
            for (const { data, shouldPass } of todoData) {
                const result = await validationService.validateCrossFieldConsistency(data);
                if (shouldPass) {
                    expect(result.isConsistent).toBe(true);
                    expect(result.consistencyScore).toBeGreaterThan(0.7);
                }
                else {
                    expect(result.isConsistent).toBe(false);
                    expect(result.inconsistencies.length).toBeGreaterThan(0);
                }
            }
        });
    });
});
//# sourceMappingURL=validation.test.js.map