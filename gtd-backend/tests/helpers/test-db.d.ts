import { Kysely } from 'kysely';
export interface TestDatabase {
    users: {
        id: string;
        email: string;
        name: string;
        avatar_url: string | null;
        provider: 'google' | 'github';
        provider_id: string;
        created_at: Date;
        updated_at: Date;
    };
    todos: {
        id: string;
        user_id: string;
        title: string;
        description: string | null;
        outcome: string;
        next_action: string;
        context: string | null;
        priority: 'low' | 'medium' | 'high' | 'urgent';
        energy_level: 'low' | 'medium' | 'high';
        time_estimate: number | null;
        due_date: Date | null;
        completed: boolean;
        clarified: boolean;
        gtd_quality_score: number;
        vector_clock: string;
        last_modified_device: string;
        created_at: Date;
        updated_at: Date;
    };
    subtasks: {
        id: string;
        todo_id: string;
        title: string;
        description: string | null;
        outcome: string;
        next_action: string;
        order_index: number;
        completed: boolean;
        gtd_quality_score: number;
        created_at: Date;
        updated_at: Date;
    };
    audit_trails: {
        id: string;
        entity_type: 'todo' | 'subtask' | 'user';
        entity_id: string;
        action: 'create' | 'update' | 'delete' | 'complete' | 'uncomplete';
        user_id: string;
        old_values: string | null;
        new_values: string;
        device_id: string;
        ip_address: string | null;
        user_agent: string | null;
        created_at: Date;
    };
    sync_metadata: {
        id: string;
        user_id: string;
        device_id: string;
        entity_type: 'todo' | 'subtask';
        entity_id: string;
        vector_clock: string;
        last_sync: Date;
        conflict_resolution: 'manual' | 'auto_merge' | 'latest_wins' | null;
        created_at: Date;
        updated_at: Date;
    };
}
export declare class TestDbManager {
    private db;
    private kysely;
    private dbPath;
    constructor();
    setup(): Promise<Kysely<TestDatabase>>;
    runMigrations(): Promise<void>;
    getKysely(): Kysely<TestDatabase>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=test-db.d.ts.map