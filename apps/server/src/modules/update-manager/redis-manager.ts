import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { UpdateManager } from './manager';

function key(parts: TemplateStringsArray, ...args: any[]) {
  return parts.reduce((prev, curr, i) => {
    return prev + curr + (args[i] || '');
  }, 'um:');
}

function lock(parts: TemplateStringsArray, ...args: any[]) {
  return parts.reduce((prev, curr, i) => {
    return prev + curr + (args[i] || '');
  }, 'um-lock:');
}

@Injectable()
export class RedisUpdateManager extends UpdateManager {
  private readonly redis: Redis;
  constructor(
    private readonly config: Config,
    protected override readonly db: PrismaService,
    @Inject('UPDATE_MANAGER_AUTOMATION') override readonly automation: boolean
  ) {
    super(db, automation);
    this.redis = new Redis(config.redis);
  }

  override async push(
    workspaceId: string,
    guid: string,
    update: Buffer
  ): Promise<boolean> {
    try {
      await this.redis.rpush(
        'update-manager:pending-docs',
        `${workspaceId}:${guid}`
      );
      const result = await this.redis.rpush(
        key`${workspaceId}:${guid}`,
        update
      );
      return result === 1;
    } catch (e) {
      return await super.push(workspaceId, guid, update);
    }
  }

  override async getUpdates(
    workspaceId: string,
    guid: string
  ): Promise<Buffer[]> {
    try {
      return this.redis.lrangeBuffer(key`${workspaceId}:${guid}`, 0, -1);
    } catch (e) {
      return super.getUpdates(workspaceId, guid);
    }
  }

  override async apply(): Promise<void> {
    // incase some update fallback to db
    await super.apply();

    const pendingDoc = await this.redis
      .lpop('update-manager:pending-docs')
      .catch(() => null); // safe

    if (!pendingDoc) {
      return;
    }

    const [workspaceId, id] = pendingDoc.split(':');

    const updateKey = key`${workspaceId}:${id}`;
    const lockKey = lock`${workspaceId}:${id}`;

    // acquire the lock
    const lockResult = await this.redis
      .set(lockKey, '1', 'EX', 600, 'NX')
      .catch(() => null); // safe;

    if (!lockResult) {
      return;
    }

    try {
      // fetch pending updates
      const updates = await this.redis
        .lrangeBuffer(updateKey, 0, -1)
        .catch(() => []); // safe

      if (!updates.length) {
        return;
      }

      this.logger.log(
        `applying updates for workspace: ${workspaceId}, guid: ${id}`
      );

      const snapshot = await this.getSnapshot(workspaceId, id);

      // merge
      const blob = snapshot
        ? UpdateManager.mergeUpdates([snapshot, ...updates])
        : UpdateManager.mergeUpdates(updates);

      // update snapshot
      await this.db.snapshot.upsert({
        where: {
          id,
        },
        create: {
          id,
          workspaceId,
          blob,
        },
        update: {
          blob,
        },
      });

      // delete merged updates
      await this.redis
        .ltrim(updateKey, updates.length, -1)
        // safe, fallback to mergeUpdates
        .catch(() => {});
    } catch (e) {
      await this.redis
        .rpush('update-manager:pending-docs', `${workspaceId}:${id}`)
        .catch(() => null); // safe
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
