import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database, SyncMetadata } from '@/types/database';

export interface VectorClock {
  [deviceId: string]: number;
}

export class SyncService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Creates or updates sync metadata for an entity
   */
  async updateSyncMetadata(
    userId: string,
    deviceId: string,
    entityType: 'todo' | 'subtask',
    entityId: string,
    vectorClock: VectorClock,
    conflictResolution?: 'manual' | 'auto_merge' | 'latest_wins' | null
  ): Promise<void> {
    const now = new Date();
    
    await this.db
      .insertInto('sync_metadata')
      .values({
        id: randomUUID(),
        user_id: userId,
        device_id: deviceId,
        entity_type: entityType,
        entity_id: entityId,
        vector_clock: JSON.stringify(vectorClock),
        last_sync: now,
        conflict_resolution: conflictResolution || null,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(['user_id', 'device_id', 'entity_type', 'entity_id']).doUpdateSet({
          vector_clock: JSON.stringify(vectorClock),
          last_sync: now,
          conflict_resolution: conflictResolution || null,
          updated_at: now,
        })
      )
      .execute();
  }

  /**
   * Gets sync metadata for an entity across all devices
   */
  async getSyncMetadata(
    userId: string,
    entityType: 'todo' | 'subtask',
    entityId: string
  ): Promise<SyncMetadata[]> {
    return this.db
      .selectFrom('sync_metadata')
      .where('user_id', '=', userId)
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .selectAll()
      .execute();
  }

  /**
   * Increments vector clock for a device
   */
  incrementVectorClock(currentClock: VectorClock, deviceId: string): VectorClock {
    return {
      ...currentClock,
      [deviceId]: (currentClock[deviceId] || 0) + 1,
    };
  }

  /**
   * Merges vector clocks from multiple devices
   */
  mergeVectorClocks(clocks: VectorClock[]): VectorClock {
    const merged: VectorClock = {};
    
    for (const clock of clocks) {
      for (const [deviceId, timestamp] of Object.entries(clock)) {
        merged[deviceId] = Math.max(merged[deviceId] || 0, timestamp);
      }
    }
    
    return merged;
  }

  /**
   * Detects conflicts between vector clocks
   */
  detectConflict(clock1: VectorClock, clock2: VectorClock): boolean {
    const allDevices = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);
    
    let clock1Greater = false;
    let clock2Greater = false;
    
    for (const device of allDevices) {
      const val1 = clock1[device] || 0;
      const val2 = clock2[device] || 0;
      
      if (val1 > val2) clock1Greater = true;
      if (val2 > val1) clock2Greater = true;
      
      // If both are greater in some aspects, it's a conflict
      if (clock1Greater && clock2Greater) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Determines which vector clock is "later" (for latest_wins resolution)
   */
  compareVectorClocks(clock1: VectorClock, clock2: VectorClock): 'first' | 'second' | 'conflict' {
    if (this.detectConflict(clock1, clock2)) {
      return 'conflict';
    }
    
    // Sum up all timestamps as a simple comparison
    const sum1 = Object.values(clock1).reduce((a, b) => a + b, 0);
    const sum2 = Object.values(clock2).reduce((a, b) => a + b, 0);
    
    return sum1 >= sum2 ? 'first' : 'second';
  }

  /**
   * Gets entities that need sync for a user/device combination
   */
  async getEntitiesNeedingSync(
    userId: string,
    deviceId: string,
    lastSyncTime?: Date
  ): Promise<{ todos: string[]; subtasks: string[] }> {
    const syncFilter = lastSyncTime 
      ? this.db.selectFrom('sync_metadata')
          .where('user_id', '=', userId)
          .where('device_id', '!=', deviceId)
          .where('last_sync', '>', lastSyncTime)
      : this.db.selectFrom('sync_metadata')
          .where('user_id', '=', userId)
          .where('device_id', '!=', deviceId);

    const recentSyncs = await syncFilter.selectAll().execute();
    
    const todos = recentSyncs
      .filter(sync => sync.entity_type === 'todo')
      .map(sync => sync.entity_id);
      
    const subtasks = recentSyncs
      .filter(sync => sync.entity_type === 'subtask')
      .map(sync => sync.entity_id);
    
    return { todos: [...new Set(todos)], subtasks: [...new Set(subtasks)] };
  }
}