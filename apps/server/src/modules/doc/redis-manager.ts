import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { Config } from '../../config';
import { Metrics } from '../../metrics/metrics';
import { PrismaService } from '../../prisma';
import { DocManager } from './manager';

function makeKey(prefix: string) {
  return (parts: TemplateStringsArray, ...args: any[]) => {
    return parts.reduce((prev, curr, i) => {
      return prev + curr + (args[i] || '');
    }, prefix);
  };
}

const pending = 'um_pending:';
const updates = makeKey('um_u:');
const lock = makeKey('um_l:');

const pushUpdateLua = `
    redis.call('sadd', KEYS[1], ARGV[1])
    redis.call('rpush', KEYS[2], ARGV[2])
`;

@Injectable()
export class RedisDocManager extends DocManager {
  private readonly redis: Redis;

  constructor(
    protected override readonly db: PrismaService,
    @Inject('DOC_MANAGER_AUTOMATION')
    protected override readonly automation: boolean,
    protected override readonly config: Config,
    protected override readonly metrics: Metrics
  ) {
    super(db, automation, config, metrics);
    this.redis = new Redis(config.redis);
    this.redis.defineCommand('pushDocUpdate', {
      numberOfKeys: 2,
      lua: pushUpdateLua,
    });
  }

  override onModuleInit(): void {
    if (this.automation) {
      this.logger.log('Use Redis');
      this.setup();
    }
  }

  override async push(workspaceId: string, guid: string, update: Buffer) {
    try {
      const key = `${workspaceId}:${guid}`;

      // @ts-expect-error custom command
      this.redis.pushDocUpdate(pending, updates`${key}`, key, update);

      this.logger.verbose(
        `pushed update for workspace: ${workspaceId}, guid: ${guid}`
      );
    } catch (e) {
      return await super.push(workspaceId, guid, update);
    }
  }

  override async getUpdates(
    workspaceId: string,
    guid: string
  ): Promise<Buffer[]> {
    try {
      return this.redis.lrangeBuffer(updates`${workspaceId}:${guid}`, 0, -1);
    } catch (e) {
      return super.getUpdates(workspaceId, guid);
    }
  }

  override async apply(): Promise<void> {
    // incase some update fallback to db
    await super.apply();

    const pendingDoc = await this.redis.spop(pending).catch(() => null); // safe

    if (!pendingDoc) {
      return;
    }

    const updateKey = updates`${pendingDoc}`;
    const lockKey = lock`${pendingDoc}`;
    const splitAt = pendingDoc.indexOf(':');
    const workspaceId = pendingDoc.substring(0, splitAt);
    const id = pendingDoc.substring(splitAt + 1);

    // acquire the lock
    const lockResult = await this.redis
      .set(
        lockKey,
        '1',
        'EX',
        // 10mins, incase progress exit in between lock require & release, which is a rare.
        // if the lock is really hold more then 10mins, we should check the merge logic correctness
        600,
        'NX'
      )
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

      this.logger.verbose(
        `applying ${updates.length} updates for workspace: ${workspaceId}, guid: ${id}`
      );

      const snapshot = await this.getSnapshot(workspaceId, id);

      // merge
      const blob = snapshot
        ? this.mergeUpdates(id, snapshot, ...updates)
        : this.mergeUpdates(id, ...updates);

      // update snapshot

      await this.upsert(workspaceId, id, blob);

      // delete merged updates
      await this.redis
        .ltrim(updateKey, updates.length, -1)
        // safe, fallback to mergeUpdates
        .catch(e => {
          this.logger.error('Failed to remove merged updates from Redis', e);
        });
    } catch (e) {
      this.logger.error('Failed to merge updates with snapshot', e);
      await this.redis.sadd(pending, `${workspaceId}:${id}`).catch(() => null); // safe
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
