import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import Redis, { Command } from 'ioredis';
import { ClsService } from 'nestjs-cls';

import { MUTEX_RETRY, MUTEX_WAIT, sleep } from '../../fundamentals';

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
export class MutexRedisService {
  private readonly logger = new Logger(MutexRedisService.name);

  constructor(
    private readonly redis: Redis,
    private readonly cls: ClsService
  ) {}

  private getId() {
    let id = this.cls.get('asyncId');

    if (!id) {
      id = randomUUID();
      this.cls.set('asyncId', id);
    }

    return id;
  }

  async lock(key: string, timeout: number = 100): Promise<boolean> {
    const clientId = this.getId();
    console.error('lock', key, clientId);
    this.logger.debug(`Client ID is ${clientId}`);
    const timeoutStr = timeout.toString();

    const fetchLock = async (retry: number): Promise<boolean> => {
      if (retry === 0) {
        this.logger.error(
          `Failed to fetch lock ${key} after ${MUTEX_RETRY} retry`
        );
        return false;
      }
      try {
        const success = await this.redis.sendCommand(
          new Command('EVAL', [lockScript, '1', key, clientId, timeoutStr])
        );
        if (success === 1) {
          console.error('success lock', key);
          return true;
        } else {
          this.logger.warn(
            `Failed to fetch lock ${key}, retrying in ${MUTEX_WAIT} ms`
          );
          await sleep(MUTEX_WAIT * (MUTEX_RETRY - retry + 1));
          return fetchLock(retry - 1);
        }
      } catch (error: any) {
        this.logger.error(
          `Unexpected error when fetch lock ${key}: ${error.message}`
        );
        return false;
      }
    };

    return fetchLock(MUTEX_RETRY);
  }

  async unlock(key: string, ignoreUnlockFail = false): Promise<void> {
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
