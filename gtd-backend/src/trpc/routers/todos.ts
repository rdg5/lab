import { z } from 'zod';
import { randomUUID } from 'crypto';
import { router, protectedProcedure, paginationSchema } from '../trpc.js';
import { getDb } from '../../db/database.js';
import { GTDEnforcementService } from '../../services/gtd-enforcement.js';
import { LLMIntegrationService } from '../../services/llm-integration.js';
import { AuditService } from '../../services/audit.js';
import { SyncService } from '../../services/sync.js';
import { TRPCError } from '@trpc/server';
import type { TodoWithSubtasks, TodoFilters } from '../../types/api.js';

const gtdService = new GTDEnforcementService();
const llmService = new LLMIntegrationService();
const auditService = new AuditService(getDb());
const syncService = new SyncService(getDb());

// Input validation schemas
const createTodoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  outcome: z.string().optional(),
  next_action: z.string().optional(),
  context: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  energy_level: z.enum(['low', 'medium', 'high']).default('medium'),
  time_estimate: z.number().int().positive().optional(),
  due_date: z.date().optional(),
  device_id: z.string().min(1),
});

const updateTodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  outcome: z.string().optional(),
  next_action: z.string().optional(),
  context: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  energy_level: z.enum(['low', 'medium', 'high']).optional(),
  time_estimate: z.number().int().positive().optional(),
  due_date: z.date().optional(),
  completed: z.boolean().optional(),
  device_id: z.string().min(1),
});

const createSubtaskSchema = z.object({
  todo_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  outcome: z.string().optional(),
  next_action: z.string().optional(),
  order_index: z.number().int().nonnegative().optional(),
  device_id: z.string().min(1),
});

const todoFiltersSchema = z.object({
  completed: z.boolean().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  energy_level: z.enum(['low', 'medium', 'high']).optional(),
  context: z.string().optional(),
  due_before: z.date().optional(),
  due_after: z.date().optional(),
  search: z.string().optional(),
});

export const todosRouter = router({
  // Create a new todo
  create: protectedProcedure
    .input(createTodoSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const now = new Date();
      const todoId = randomUUID();
      
      // If no outcome/next_action provided, use AI to generate them
      let { outcome, next_action } = input;
      let clarified = false;
      let qualityScore = 0.5;

      if (!outcome || !next_action) {
        try {
          const analysis = await llmService.analyzeTodo(input);
          outcome = analysis.outcome;
          next_action = analysis.nextAction;
          clarified = analysis.clarified;
          qualityScore = analysis.qualityScore;
        } catch (error) {
          // Fall back to basic values if AI fails
          outcome = outcome || 'Success looks like having this task completed';
          next_action = next_action || 'Start working on this task';
        }
      }

      // Validate GTD quality
      const todo = {
        ...input,
        outcome,
        next_action,
        clarified,
        gtd_quality_score: qualityScore,
      };

      const metrics = gtdService.validateTodo(todo);
      gtdService.enforceQualityThreshold(metrics.overallScore);

      // Create vector clock for this device
      const vectorClock = { [input.device_id]: 1 };

      // Insert todo into database
      const newTodo = await db
        .insertInto('todos')
        .values({
          id: todoId,
          user_id: ctx.user.id,
          title: input.title,
          description: input.description || null,
          outcome: outcome!,
          next_action: next_action!,
          context: input.context || null,
          priority: input.priority,
          energy_level: input.energy_level,
          time_estimate: input.time_estimate || null,
          due_date: input.due_date || null,
          completed: false,
          clarified,
          gtd_quality_score: metrics.overallScore,
          vector_clock: JSON.stringify(vectorClock),
          last_modified_device: input.device_id,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Create audit trail
      await auditService.createAuditTrail(
        'todo',
        todoId,
        'create',
        ctx.user.id,
        null,
        newTodo,
        input.device_id,
        ctx.ipAddress,
        ctx.userAgent
      );

      // Update sync metadata
      await syncService.updateSyncMetadata(
        ctx.user.id,
        input.device_id,
        'todo',
        todoId,
        vectorClock
      );

      return { ...newTodo, subtasks: [] } as TodoWithSubtasks;
    }),

  // Get todos list with filtering and pagination
  list: protectedProcedure
    .input(z.object({
      ...paginationSchema.shape,
      filters: todoFiltersSchema.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      let query = db
        .selectFrom('todos')
        .where('user_id', '=', ctx.user.id)
        .selectAll();

      // Apply filters
      if (input.filters) {
        if (input.filters.completed !== undefined) {
          query = query.where('completed', '=', input.filters.completed);
        }
        if (input.filters.priority) {
          query = query.where('priority', '=', input.filters.priority);
        }
        if (input.filters.energy_level) {
          query = query.where('energy_level', '=', input.filters.energy_level);
        }
        if (input.filters.context) {
          query = query.where('context', '=', input.filters.context);
        }
        if (input.filters.due_before) {
          query = query.where('due_date', '<=', input.filters.due_before);
        }
        if (input.filters.due_after) {
          query = query.where('due_date', '>=', input.filters.due_after);
        }
        if (input.filters.search) {
          const searchTerm = `%${input.filters.search}%`;
          query = query.where((eb) =>
            eb.or([
              eb('title', 'like', searchTerm),
              eb('description', 'like', searchTerm),
              eb('outcome', 'like', searchTerm),
              eb('next_action', 'like', searchTerm),
            ])
          );
        }
      }

      // Cursor-based pagination
      if (input.cursor) {
        query = query.where('created_at', '<', new Date(input.cursor));
      }

      const todos = await query
        .orderBy('created_at', 'desc')
        .limit(input.limit + 1)
        .execute();

      const hasMore = todos.length > input.limit;
      const items = hasMore ? todos.slice(0, -1) : todos;
      const nextCursor = hasMore ? items[items.length - 1].created_at.toISOString() : undefined;

      // Get subtasks for each todo
      const todosWithSubtasks: TodoWithSubtasks[] = [];
      
      for (const todo of items) {
        const subtasks = await db
          .selectFrom('subtasks')
          .where('todo_id', '=', todo.id)
          .orderBy('order_index', 'asc')
          .selectAll()
          .execute();
        
        todosWithSubtasks.push({ ...todo, subtasks });
      }

      // Get total count for pagination info
      let countQuery = db
        .selectFrom('todos')
        .where('user_id', '=', ctx.user.id)
        .select((eb) => eb.fn.count('id').as('count'));

      if (input.filters) {
        // Apply same filters to count query
        if (input.filters.completed !== undefined) {
          countQuery = countQuery.where('completed', '=', input.filters.completed);
        }
        // ... apply other filters similarly
      }

      const countResult = await countQuery.executeTakeFirst();
      const total = Number(countResult?.count || 0);

      return {
        items: todosWithSubtasks,
        nextCursor,
        hasMore,
        total,
      };
    }),

  // Get single todo by ID
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      const todo = await db
        .selectFrom('todos')
        .where('id', '=', input.id)
        .where('user_id', '=', ctx.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!todo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Todo not found',
        });
      }

      const subtasks = await db
        .selectFrom('subtasks')
        .where('todo_id', '=', todo.id)
        .orderBy('order_index', 'asc')
        .selectAll()
        .execute();

      return { ...todo, subtasks } as TodoWithSubtasks;
    }),

  // Update a todo
  update: protectedProcedure
    .input(updateTodoSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      // Get current todo
      const currentTodo = await db
        .selectFrom('todos')
        .where('id', '=', input.id)
        .where('user_id', '=', ctx.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!currentTodo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Todo not found',
        });
      }

      // Prepare update data
      const { id, device_id, ...updateData } = input;
      const now = new Date();

      // Update vector clock
      const currentVectorClock = JSON.parse(currentTodo.vector_clock);
      const newVectorClock = syncService.incrementVectorClock(currentVectorClock, device_id);

      // Re-evaluate quality if outcome or next_action changed
      let qualityScore = currentTodo.gtd_quality_score;
      if (updateData.outcome || updateData.next_action) {
        const updatedTodo = { ...currentTodo, ...updateData };
        const metrics = gtdService.validateTodo(updatedTodo);
        qualityScore = metrics.overallScore;
        
        // Enforce quality threshold for significant changes
        if (updateData.outcome || updateData.next_action) {
          gtdService.enforceQualityThreshold(qualityScore);
        }
      }

      // Update todo
      const updatedTodo = await db
        .updateTable('todos')
        .set({
          ...updateData,
          gtd_quality_score: qualityScore,
          vector_clock: JSON.stringify(newVectorClock),
          last_modified_device: device_id,
          updated_at: now,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Create audit trail
      await auditService.createAuditTrail(
        'todo',
        input.id,
        updateData.completed !== undefined ? 
          (updateData.completed ? 'complete' : 'uncomplete') : 'update',
        ctx.user.id,
        currentTodo,
        updatedTodo,
        device_id,
        ctx.ipAddress,
        ctx.userAgent
      );

      // Update sync metadata
      await syncService.updateSyncMetadata(
        ctx.user.id,
        device_id,
        'todo',
        input.id,
        newVectorClock
      );

      // Get subtasks
      const subtasks = await db
        .selectFrom('subtasks')
        .where('todo_id', '=', input.id)
        .orderBy('order_index', 'asc')
        .selectAll()
        .execute();

      return { ...updatedTodo, subtasks } as TodoWithSubtasks;
    }),

  // Delete a todo
  delete: protectedProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      device_id: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      // Get current todo for audit
      const currentTodo = await db
        .selectFrom('todos')
        .where('id', '=', input.id)
        .where('user_id', '=', ctx.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!currentTodo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Todo not found',
        });
      }

      // Delete todo (cascade will handle subtasks)
      await db
        .deleteFrom('todos')
        .where('id', '=', input.id)
        .execute();

      // Create audit trail
      await auditService.createAuditTrail(
        'todo',
        input.id,
        'delete',
        ctx.user.id,
        currentTodo,
        null,
        input.device_id,
        ctx.ipAddress,
        ctx.userAgent
      );

      return { success: true };
    }),

  // Create a subtask
  createSubtask: protectedProcedure
    .input(createSubtaskSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      // Verify todo exists and belongs to user
      const todo = await db
        .selectFrom('todos')
        .where('id', '=', input.todo_id)
        .where('user_id', '=', ctx.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!todo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Todo not found',
        });
      }

      const subtaskId = randomUUID();
      const now = new Date();

      // Generate outcome/next_action if not provided
      let { outcome, next_action } = input;
      if (!outcome) {
        outcome = `Success looks like completing "${input.title}" as part of the overall todo`;
      }
      if (!next_action) {
        next_action = `Start working on ${input.title.toLowerCase()}`;
      }

      // Get next order index if not provided
      let orderIndex = input.order_index;
      if (orderIndex === undefined) {
        const lastSubtask = await db
          .selectFrom('subtasks')
          .where('todo_id', '=', input.todo_id)
          .orderBy('order_index', 'desc')
          .select('order_index')
          .executeTakeFirst();
        
        orderIndex = (lastSubtask?.order_index || -1) + 1;
      }

      // Validate subtask quality
      const subtaskData = { ...input, outcome, next_action };
      const metrics = gtdService.validateSubtask(subtaskData);

      // Create subtask
      const newSubtask = await db
        .insertInto('subtasks')
        .values({
          id: subtaskId,
          todo_id: input.todo_id,
          title: input.title,
          description: input.description || null,
          outcome,
          next_action,
          order_index: orderIndex,
          completed: false,
          gtd_quality_score: metrics.overallScore,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Create audit trail
      await auditService.createAuditTrail(
        'subtask',
        subtaskId,
        'create',
        ctx.user.id,
        null,
        newSubtask,
        input.device_id,
        ctx.ipAddress,
        ctx.userAgent
      );

      return newSubtask;
    }),

  // AI Analysis and improvement suggestions
  analyze: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      const todo = await db
        .selectFrom('todos')
        .where('id', '=', input.id)
        .where('user_id', '=', ctx.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!todo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Todo not found',
        });
      }

      // Get AI analysis
      const analysis = await llmService.reevaluateQuality(todo);
      
      return {
        currentQuality: todo.gtd_quality_score,
        analysis,
        meetsThreshold: analysis.qualityScore >= 0.95,
      };
    }),

  // Auto-decompose todo into subtasks
  decompose: protectedProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      device_id: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      const todo = await db
        .selectFrom('todos')
        .where('id', '=', input.id)
        .where('user_id', '=', ctx.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!todo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Todo not found',
        });
      }

      // Get AI decomposition
      const decomposition = await llmService.decomposeIntoSubtasks(todo);
      
      // Create subtasks in database
      const createdSubtasks = [];
      const now = new Date();

      for (const subtaskSuggestion of decomposition.subtasks) {
        const subtaskId = randomUUID();
        
        const newSubtask = await db
          .insertInto('subtasks')
          .values({
            id: subtaskId,
            todo_id: input.id,
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

        // Create audit trail for each subtask
        await auditService.createAuditTrail(
          'subtask',
          subtaskId,
          'create',
          ctx.user.id,
          null,
          newSubtask,
          input.device_id,
          ctx.ipAddress,
          ctx.userAgent
        );

        createdSubtasks.push(newSubtask);
      }

      return {
        reasoning: decomposition.reasoning,
        totalQualityScore: decomposition.totalQualityScore,
        subtasks: createdSubtasks,
      };
    }),
});