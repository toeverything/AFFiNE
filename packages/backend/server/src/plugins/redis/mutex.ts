import { setTimeout } from 'node:timers/promises';

import { Injectable, Logger } from '@nestjs/common';
import Redis, { Command } from 'ioredis';

import {
  BucketService,
  type GraphqlContext,
  LockGuard,
  MUTEX_RETRY,
  MUTEX_WAIT,
  MutexService,
} from '../../fundamentals';

const lockScript = `local key = KEYS[1]
local clientId = ARGV[1]
local releaseTime = ARGV[2]

if redis.call("get", key) == clientId or redis.call("set", key, clientId, "NX", "PX", releaseTime) then
  return 1
else
  return 0
end`;
const unlockScript = `local key = KEYS[1]
local clientId = ARGV[1]

if redis.call("get", key) == clientId then
  return redis.call("del", key)
else
  return 0
end`;

@Injectable()
export class MutexRedisService extends MutexService {
  constructor(
    private readonly redis: Redis,
    context: GraphqlContext,
    bucket: BucketService
  ) {
    super(context, bucket);
    this.logger = new Logger(MutexRedisService.name);
  }

  override async lock(
    key: string,
    releaseTimeInMS: number = 200
  ): Promise<LockGuard | undefined> {
    const clientId = this.getId();
    this.logger.debug(`Client ${clientId} lock try to lock ${key}`);
    const releaseTime = releaseTimeInMS.toString();

    const fetchLock = async (retry: number): Promise<LockGuard | undefined> => {
      if (retry === 0) {
        this.logger.error(
          `Failed to fetch lock ${key} after ${MUTEX_RETRY} retry`
        );
        return undefined;
      }
      try {
        const success = await this.redis.sendCommand(
          new Command('EVAL', [lockScript, '1', key, clientId, releaseTime])
        );
        if (success === 1) {
          return new LockGuard(this, key);
        } else {
          this.logger.warn(
            `Failed to fetch lock ${key}, retrying in ${MUTEX_WAIT} ms`
          );
          await setTimeout(MUTEX_WAIT * (MUTEX_RETRY - retry + 1));
          return fetchLock(retry - 1);
        }
      } catch (error: any) {
        this.logger.error(
          `Unexpected error when fetch lock ${key}: ${error.message}`
        );
        return undefined;
      }
    };

    return fetchLock(MUTEX_RETRY);
  }

  override async unlock(key: string, ignoreUnlockFail = false): Promise<void> {
    const clientId = this.getId();
    const result = await this.redis.sendCommand(
      new Command('EVAL', [unlockScript, '1', key, clientId])
    );
    if (result === 0) {
      if (!ignoreUnlockFail) {
        throw new Error(`Failed to release lock ${key}`);
      } else {
        this.logger.warn(`Failed to release lock ${key}`);
      }
    }
  }
}
