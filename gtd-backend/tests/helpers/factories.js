"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestDataFactory = void 0;
const crypto_1 = require("crypto");
class TestDataFactory {
    static createUser(overrides = {}) {
        const id = (0, crypto_1.randomUUID)();
        return {
            id,
            email: overrides.email || `user-${id}@example.com`,
            name: overrides.name || `Test User ${id.slice(0, 8)}`,
            avatar_url: overrides.avatar_url || null,
            provider: overrides.provider || 'google',
            provider_id: overrides.provider_id || `google-${id}`,
            created_at: overrides.created_at || new Date(),
            updated_at: overrides.updated_at || new Date(),
            ...overrides,
        };
    }
    static createTodo(overrides = {}) {
        const id = (0, crypto_1.randomUUID)();
        return {
            id,
            user_id: overrides.user_id || (0, crypto_1.randomUUID)(),
            title: overrides.title || `Test Todo ${id.slice(0, 8)}`,
            description: overrides.description || null,
            outcome: overrides.outcome || 'Success looks like having this task completed with clear deliverables',
            next_action: overrides.next_action || 'Open the task management system and begin the first step',
            context: overrides.context || '@computer',
            priority: overrides.priority || 'medium',
            energy_level: overrides.energy_level || 'medium',
            time_estimate: overrides.time_estimate || 30,
            due_date: overrides.due_date || null,
            completed: overrides.completed || false,
            clarified: overrides.clarified || true,
            gtd_quality_score: overrides.gtd_quality_score || 0.95,
            vector_clock: overrides.vector_clock || JSON.stringify({ [(0, crypto_1.randomUUID)()]: 1 }),
            last_modified_device: overrides.last_modified_device || (0, crypto_1.randomUUID)(),
            created_at: overrides.created_at || new Date(),
            updated_at: overrides.updated_at || new Date(),
            ...overrides,
        };
    }
    static createSubtask(overrides = {}) {
        const id = (0, crypto_1.randomUUID)();
        return {
            id,
            todo_id: overrides.todo_id || (0, crypto_1.randomUUID)(),
            title: overrides.title || `Test Subtask ${id.slice(0, 8)}`,
            description: overrides.description || null,
            outcome: overrides.outcome || 'Success looks like completing this specific subtask',
            next_action: overrides.next_action || 'Start working on this specific subtask',
            order_index: overrides.order_index || 0,
            completed: overrides.completed || false,
            gtd_quality_score: overrides.gtd_quality_score || 0.90,
            created_at: overrides.created_at || new Date(),
            updated_at: overrides.updated_at || new Date(),
            ...overrides,
        };
    }
    static createAuditTrail(overrides = {}) {
        return {
            id: (0, crypto_1.randomUUID)(),
            entity_type: 'todo',
            entity_id: (0, crypto_1.randomUUID)(),
            action: 'create',
            user_id: (0, crypto_1.randomUUID)(),
            old_values: null,
            new_values: JSON.stringify({ title: 'Test Todo' }),
            device_id: (0, crypto_1.randomUUID)(),
            ip_address: '127.0.0.1',
            user_agent: 'Jest Test Suite',
            created_at: new Date(),
            ...overrides,
        };
    }
    static createSyncMetadata(overrides = {}) {
        return {
            id: (0, crypto_1.randomUUID)(),
            user_id: (0, crypto_1.randomUUID)(),
            device_id: (0, crypto_1.randomUUID)(),
            entity_type: 'todo',
            entity_id: (0, crypto_1.randomUUID)(),
            vector_clock: JSON.stringify({ [(0, crypto_1.randomUUID)()]: 1 }),
            last_sync: new Date(),
            conflict_resolution: null,
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides,
        };
    }
    // JWT Token factory for testing authentication
    static createJWTPayload(overrides = {}) {
        return {
            userId: (0, crypto_1.randomUUID)(),
            email: 'test@example.com',
            name: 'Test User',
            provider: 'google',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
            ...overrides,
        };
    }
    // OAuth response factories
    static createGoogleOAuthUser(overrides = {}) {
        const id = (0, crypto_1.randomUUID)();
        return {
            id: `google-${id}`,
            email: `user-${id}@gmail.com`,
            verified_email: true,
            name: `Google User ${id.slice(0, 8)}`,
            given_name: 'Google',
            family_name: 'User',
            picture: `https://lh3.googleusercontent.com/a/test-${id}`,
            locale: 'en',
            ...overrides,
        };
    }
    static createGitHubOAuthUser(overrides = {}) {
        const id = (0, crypto_1.randomUUID)();
        return {
            id: parseInt(id.replace(/-/g, '').slice(0, 8), 16),
            login: `github-user-${id.slice(0, 8)}`,
            avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
            name: `GitHub User ${id.slice(0, 8)}`,
            email: `user-${id}@github.local`,
            bio: 'Test user created by factory',
            public_repos: 42,
            followers: 10,
            following: 15,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: new Date().toISOString(),
            ...overrides,
        };
    }
    // LLM Response factories for testing AI integration
    static createLLMAnalysisResponse(overrides = {}) {
        return {
            clarified: true,
            outcome: 'Success looks like having a well-defined, actionable task with clear deliverables',
            nextAction: 'Open the project file and review the current requirements',
            qualityScore: 0.95,
            context: '@computer',
            energyLevel: 'medium',
            timeEstimate: 30,
            subtasks: [],
            reasoning: 'This task has a clear outcome and specific next action, making it well-suited for GTD methodology',
            ...overrides,
        };
    }
    static createLLMSubtaskDecomposition(overrides = {}) {
        return {
            subtasks: [
                {
                    title: 'Research and planning phase',
                    outcome: 'Success looks like having a comprehensive understanding of requirements',
                    nextAction: 'Create a new document and list all known requirements',
                    orderIndex: 0,
                    qualityScore: 0.92,
                },
                {
                    title: 'Implementation phase',
                    outcome: 'Success looks like having working code that meets requirements',
                    nextAction: 'Set up the development environment and create initial files',
                    orderIndex: 1,
                    qualityScore: 0.88,
                },
                {
                    title: 'Testing and validation',
                    outcome: 'Success looks like verified functionality with passing tests',
                    nextAction: 'Write the first test case for the main functionality',
                    orderIndex: 2,
                    qualityScore: 0.90,
                },
            ],
            reasoning: 'This task can be broken down into logical phases with clear outcomes',
            totalQualityScore: 0.90,
            ...overrides,
        };
    }
    // Quality metrics for testing
    static createQualityMetrics(overrides = {}) {
        return {
            hasOutcome: true,
            hasNextAction: true,
            outcomeClarity: 0.95,
            actionSpecificity: 0.90,
            contextRelevance: 0.85,
            estimateAccuracy: 0.80,
            overallScore: 0.88,
            suggestions: [
                'Consider adding more specific context tags',
                'Time estimate could be more precise',
            ],
            ...overrides,
        };
    }
}
exports.TestDataFactory = TestDataFactory;
//# sourceMappingURL=factories.js.map