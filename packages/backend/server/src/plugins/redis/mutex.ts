import { Injectable, Logger } from '@nestjs/common';
import { Command } from 'ioredis';

import { ILocker, Lock } from '../../fundamentals';
import { SessionRedis } from './instances';

const lockScript = `local key = KEYS[1]
local clientId = ARGV[1]

if redis.call("get", key) == clientId or redis.call("set", key, clientId, "NX", "EX", 60) then
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
export class RedisMutexLocker implements ILocker {
  private readonly logger = new Logger(RedisMutexLocker.name);
  constructor(private readonly redis: SessionRedis) {}

  async lock(owner: string, key: string): Promise<Lock> {
    const lockKey = `MutexLock:${key}`;
    this.logger.debug(`Client ${owner} is trying to lock resource ${key}`);

    const success = await this.redis.sendCommand(
      new Command('EVAL', [lockScript, '1', lockKey, owner])
    );

    if (success === 1) {
      return new Lock(async () => {
        const result = await this.redis.sendCommand(
          new Command('EVAL', [unlockScript, '1', lockKey, owner])
        );

        // TODO(@darksky): lock expired condition is not handled
        if (result === 0) {
          throw new Error(`Failed to release lock ${key}`);
        }
      });
    }

    throw new Error(`Failed to acquire lock for resource [${key}]`);
  }
}
