import { Injectable, Logger } from '@nestjs/common';
import { Command } from 'ioredis';

import { ILocker, Lock } from '../../fundamentals';
import { SessionRedis } from './instances';

// === atomic mutex lock ===
// acquire lock
// return 1 if lock is acquired
// return 0 if lock is not acquired
const lockScript = `local key = KEYS[1]
local owner = ARGV[1]

-- if lock is not exists or lock is owned by the owner
-- then set lock to the owner and return 1, otherwise return 0
-- if the lock is not released correctly due to unexpected reasons
-- lock will be released after 60 seconds
if redis.call("get", key) == owner or redis.call("set", key, owner, "NX", "EX", 60) then
  return 1
else
  return 0
end`;
// release lock
// return 1 if lock is released or lock is not exists
// return 0 if lock is not owned by the owner
const unlockScript = `local key = KEYS[1]
local owner = ARGV[1]

local value = redis.call("get", key)
if value == owner then
  return redis.call("del", key)
elseif value == nil then
  return 1
else
  return 0
end`;

@Injectable()
export class RedisMutexLocker implements ILocker {
  private readonly logger = new Logger(RedisMutexLocker.name);
  constructor(private readonly redis: SessionRedis) {}

  async lock(owner: string, key: string): Promise<Lock> {
    const lockKey = `MutexLock:${key}`;
    this.logger.verbose(`Client ${owner} is trying to lock resource ${key}`);

    const success = await this.redis.sendCommand(
      new Command('EVAL', [lockScript, '1', lockKey, owner])
    );

    if (success === 1) {
      return new Lock(async () => {
        const result = await this.redis.sendCommand(
          new Command('EVAL', [unlockScript, '1', lockKey, owner])
        );

        if (result === 0) {
          throw new Error(`Failed to release lock ${key}`);
        }
      });
    }

    throw new Error(`Failed to acquire lock for resource [${key}]`);
  }
}
