import type { TestDatabase } from './test-db';
export type CreateUserData = Partial<TestDatabase['users']> & {
    email?: string;
    name?: string;
};
export type CreateTodoData = Partial<TestDatabase['todos']> & {
    user_id?: string;
    title?: string;
};
export type CreateSubtaskData = Partial<TestDatabase['subtasks']> & {
    todo_id?: string;
    title?: string;
};
export declare class TestDataFactory {
    static createUser(overrides?: CreateUserData): TestDatabase['users'];
    static createTodo(overrides?: CreateTodoData): TestDatabase['todos'];
    static createSubtask(overrides?: CreateSubtaskData): TestDatabase['subtasks'];
    static createAuditTrail(overrides?: Partial<TestDatabase['audit_trails']>): TestDatabase['audit_trails'];
    static createSyncMetadata(overrides?: Partial<TestDatabase['sync_metadata']>): TestDatabase['sync_metadata'];
    static createJWTPayload(overrides?: any): any;
    static createGoogleOAuthUser(overrides?: any): any;
    static createGitHubOAuthUser(overrides?: any): any;
    static createLLMAnalysisResponse(overrides?: any): any;
    static createLLMSubtaskDecomposition(overrides?: any): any;
    static createQualityMetrics(overrides?: any): any;
}
//# sourceMappingURL=factories.d.ts.map