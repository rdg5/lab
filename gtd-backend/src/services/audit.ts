import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database, AuditTrail } from '../types/database.js';

export class AuditService {
  constructor(private db: Kysely<Database>) {}

  async createAuditTrail(
    entityType: 'todo' | 'subtask' | 'user',
    entityId: string,
    action: 'create' | 'update' | 'delete' | 'complete' | 'uncomplete',
    userId: string,
    oldValues: any | null,
    newValues: any,
    deviceId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await this.db
        .insertInto('audit_trails')
        .values({
          id: randomUUID(),
          entity_type: entityType,
          entity_id: entityId,
          action,
          user_id: userId,
          old_values: oldValues ? JSON.stringify(oldValues) : null,
          new_values: JSON.stringify(newValues),
          device_id: deviceId,
          ip_address: ipAddress || null,
          user_agent: userAgent || null,
          created_at: new Date(),
        })
        .execute();
    } catch (error) {
      console.error('Failed to create audit trail:', error);
      // Don't throw - audit failures shouldn't break operations
    }
  }

  async getAuditTrail(
    entityType?: 'todo' | 'subtask' | 'user',
    entityId?: string,
    userId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AuditTrail[]> {
    let query = this.db
      .selectFrom('audit_trails')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (entityType) {
      query = query.where('entity_type', '=', entityType);
    }

    if (entityId) {
      query = query.where('entity_id', '=', entityId);
    }

    if (userId) {
      query = query.where('user_id', '=', userId);
    }

    return query.execute();
  }
}