import Queue from 'bull';
import { LLMIntegrationService } from './llm-integration';
import { GTDEnforcementService } from './gtd-enforcement';
import { getDb } from '@/db/database';
import { AuditService } from './audit';
import type { Todo } from '@/types/database';

// Job data interfaces
export interface LLMProcessingJobData {
  todoId: string;
  userId: string;
  deviceId: string;
  operation: 'analyze' | 'decompose' | 'reevaluate';
}

export interface QualityReevaluationJobData {
  todoId: string;
  userId: string;
  reason: 'scheduled' | 'completion_changed' | 'content_changed';
}

export interface SyncConflictJobData {
  todoId: string;
  userId: string;
  deviceIds: string[];
  conflictType: 'vector_clock' | 'content';
}

export class QueueService {
  private llmQueue: Queue.Queue<LLMProcessingJobData>;
  private qualityQueue: Queue.Queue<QualityReevaluationJobData>;
  private syncQueue: Queue.Queue<SyncConflictJobData>;
  
  private llmService: LLMIntegrationService;
  private gtdService: GTDEnforcementService;
  private auditService: AuditService;

  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    // Initialize queues
    this.llmQueue = new Queue('LLM Processing', { redis: redisConfig });
    this.qualityQueue = new Queue('Quality Re-evaluation', { redis: redisConfig });
    this.syncQueue = new Queue('Sync Conflict Resolution', { redis: redisConfig });

    // Initialize services
    this.llmService = new LLMIntegrationService();
    this.gtdService = new GTDEnforcementService();
    this.auditService = new AuditService(getDb());

    this.setupJobProcessors();
  }

  private setupJobProcessors() {
    // LLM Processing Queue
    this.llmQueue.process('analyze-todo', 3, async (job) => {
      return this.processLLMAnalysis(job.data);
    });

    this.llmQueue.process('decompose-todo', 2, async (job) => {
      return this.processLLMDecomposition(job.data);
    });

    this.llmQueue.process('reevaluate-todo', 5, async (job) => {
      return this.processLLMReevaluation(job.data);
    });

    // Quality Re-evaluation Queue
    this.qualityQueue.process('reevaluate-quality', 10, async (job) => {
      return this.processQualityReevaluation(job.data);
    });

    // Sync Conflict Resolution Queue
    this.syncQueue.process('resolve-conflict', 5, async (job) => {
      return this.processSyncConflictResolution(job.data);
    });

    // Error handling
    this.llmQueue.on('failed', (job, err) => {
      console.error(`LLM job ${job.id} failed:`, err);
    });

    this.qualityQueue.on('failed', (job, err) => {
      console.error(`Quality job ${job.id} failed:`, err);
    });

    this.syncQueue.on('failed', (job, err) => {
      console.error(`Sync job ${job.id} failed:`, err);
    });
  }

  // Public methods to add jobs to queues
  async queueLLMAnalysis(data: LLMProcessingJobData, delay?: number) {
    return this.llmQueue.add('analyze-todo', data, {
      delay: delay || 0,
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  async queueLLMDecomposition(data: LLMProcessingJobData, delay?: number) {
    return this.llmQueue.add('decompose-todo', data, {
      delay: delay || 0,
      attempts: 2,
      backoff: 'exponential',
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  async queueQualityReevaluation(data: QualityReevaluationJobData, delay?: number) {
    return this.qualityQueue.add('reevaluate-quality', data, {
      delay: delay || 5000, // Default 5 second delay
      attempts: 2,
      removeOnComplete: 20,
      removeOnFail: 10,
    });
  }

  async queueSyncConflictResolution(data: SyncConflictJobData) {
    return this.syncQueue.add('resolve-conflict', data, {
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 5,
      removeOnFail: 10,
    });
  }

  // Job processors
  private async processLLMAnalysis(data: LLMProcessingJobData) {
    const db = getDb();
    
    const todo = await db
      .selectFrom('todos')
      .where('id', '=', data.todoId)
      .where('user_id', '=', data.userId)
      .selectAll()
      .executeTakeFirst();

    if (!todo) {
      throw new Error(`Todo ${data.todoId} not found`);
    }

    const analysis = await this.llmService.reevaluateQuality(todo);
    
    // Update todo if quality improved significantly
    if (analysis.qualityScore > todo.gtd_quality_score + 0.1) {
      await db
        .updateTable('todos')
        .set({
          outcome: analysis.outcome,
          next_action: analysis.nextAction,
          gtd_quality_score: analysis.qualityScore,
          clarified: analysis.clarified,
          updated_at: new Date(),
        })
        .where('id', '=', data.todoId)
        .execute();

      // Create audit trail
      await this.auditService.createAuditTrail(
        'todo',
        data.todoId,
        'update',
        data.userId,
        todo,
        { ...todo, gtd_quality_score: analysis.qualityScore },
        data.deviceId || 'system'
      );
    }

    return {
      originalQuality: todo.gtd_quality_score,
      newQuality: analysis.qualityScore,
      improved: analysis.qualityScore > todo.gtd_quality_score,
    };
  }

  private async processLLMDecomposition(data: LLMProcessingJobData) {
    const db = getDb();
    
    const todo = await db
      .selectFrom('todos')
      .where('id', '=', data.todoId)
      .where('user_id', '=', data.userId)
      .selectAll()
      .executeTakeFirst();

    if (!todo) {
      throw new Error(`Todo ${data.todoId} not found`);
    }

    // Only decompose if todo is complex enough (long description or low quality)
    const shouldDecompose = 
      (todo.description && todo.description.length > 100) ||
      todo.gtd_quality_score < 0.85 ||
      (todo.time_estimate && todo.time_estimate > 120); // More than 2 hours

    if (!shouldDecompose) {
      return { decomposed: false, reason: 'Todo not complex enough for decomposition' };
    }

    const decomposition = await this.llmService.decomposeIntoSubtasks(todo);
    
    // Create subtasks in database
    const now = new Date();
    const createdSubtasks = [];

    for (const subtaskSuggestion of decomposition.subtasks) {
      const subtaskId = `subtask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const newSubtask = await db
        .insertInto('subtasks')
        .values({
          id: subtaskId,
          todo_id: data.todoId,
          title: subtaskSuggestion.title,
          description: null,
          outcome: subtaskSuggestion.outcome,
          next_action: subtaskSuggestion.nextAction,
          order_index: subtaskSuggestion.orderIndex,
          completed: false,
          gtd_quality_score: subtaskSuggestion.qualityScore,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await this.auditService.createAuditTrail(
        'subtask',
        subtaskId,
        'create',
        data.userId,
        null,
        newSubtask,
        data.deviceId || 'system'
      );

      createdSubtasks.push(newSubtask);
    }

    return {
      decomposed: true,
      subtasksCreated: createdSubtasks.length,
      totalQualityScore: decomposition.totalQualityScore,
    };
  }

  private async processLLMReevaluation(data: LLMProcessingJobData) {
    return this.processLLMAnalysis(data);
  }

  private async processQualityReevaluation(data: QualityReevaluationJobData) {
    const db = getDb();
    
    const todo = await db
      .selectFrom('todos')
      .where('id', '=', data.todoId)
      .where('user_id', '=', data.userId)
      .selectAll()
      .executeTakeFirst();

    if (!todo) {
      throw new Error(`Todo ${data.todoId} not found`);
    }

    // Re-evaluate using GTD service
    const reevaluation = this.gtdService.reevaluateTodo(todo);
    
    // Update quality score if changed significantly
    if (Math.abs(reevaluation.newQualityScore - todo.gtd_quality_score) > 0.05) {
      await db
        .updateTable('todos')
        .set({
          gtd_quality_score: reevaluation.newQualityScore,
          updated_at: new Date(),
        })
        .where('id', '=', data.todoId)
        .execute();

      await this.auditService.createAuditTrail(
        'todo',
        data.todoId,
        'update',
        data.userId,
        { gtd_quality_score: todo.gtd_quality_score },
        { gtd_quality_score: reevaluation.newQualityScore },
        'system'
      );
    }

    // Queue AI analysis if quality is still low
    if (reevaluation.newQualityScore < 0.85) {
      await this.queueLLMAnalysis({
        todoId: data.todoId,
        userId: data.userId,
        deviceId: 'system',
        operation: 'reevaluate',
      }, 60000); // 1 minute delay
    }

    return {
      originalQuality: todo.gtd_quality_score,
      newQuality: reevaluation.newQualityScore,
      needsImprovement: reevaluation.needsImprovement,
      suggestions: reevaluation.suggestions,
    };
  }

  private async processSyncConflictResolution(data: SyncConflictJobData) {
    // This is a simplified version - real implementation would be more complex
    const db = getDb();
    
    const syncMetadatas = await db
      .selectFrom('sync_metadata')
      .where('entity_id', '=', data.todoId)
      .where('user_id', '=', data.userId)
      .selectAll()
      .execute();

    if (syncMetadatas.length <= 1) {
      return { resolved: false, reason: 'No conflict detected' };
    }

    // Simple latest_wins resolution for now
    const latestSync = syncMetadatas.reduce((latest, current) => 
      current.last_sync > latest.last_sync ? current : latest
    );

    // Update all sync metadata to match the latest
    await db
      .updateTable('sync_metadata')
      .set({
        vector_clock: latestSync.vector_clock,
        conflict_resolution: 'latest_wins',
        updated_at: new Date(),
      })
      .where('entity_id', '=', data.todoId)
      .where('user_id', '=', data.userId)
      .execute();

    return {
      resolved: true,
      method: 'latest_wins',
      winningDevice: latestSync.device_id,
    };
  }

  // Cleanup methods
  async shutdown() {
    await Promise.all([
      this.llmQueue.close(),
      this.qualityQueue.close(),
      this.syncQueue.close(),
    ]);
  }

  // Queue monitoring methods
  async getQueueStats() {
    const [llmStats, qualityStats, syncStats] = await Promise.all([
      {
        waiting: await this.llmQueue.waiting(),
        active: await this.llmQueue.active(),
        completed: await this.llmQueue.completed(),
        failed: await this.llmQueue.failed(),
      },
      {
        waiting: await this.qualityQueue.waiting(),
        active: await this.qualityQueue.active(),
        completed: await this.qualityQueue.completed(),
        failed: await this.qualityQueue.failed(),
      },
      {
        waiting: await this.syncQueue.waiting(),
        active: await this.syncQueue.active(),
        completed: await this.syncQueue.completed(),
        failed: await this.syncQueue.failed(),
      },
    ]);

    return {
      llm: {
        waiting: llmStats.waiting.length,
        active: llmStats.active.length,
        completed: llmStats.completed.length,
        failed: llmStats.failed.length,
      },
      quality: {
        waiting: qualityStats.waiting.length,
        active: qualityStats.active.length,
        completed: qualityStats.completed.length,
        failed: qualityStats.failed.length,
      },
      sync: {
        waiting: syncStats.waiting.length,
        active: syncStats.active.length,
        completed: syncStats.completed.length,
        failed: syncStats.failed.length,
      },
    };
  }
}

// Export singleton instance
export const queueService = new QueueService();