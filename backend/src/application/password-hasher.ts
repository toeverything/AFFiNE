import { hash, verify, argon2id } from 'argon2';

import type { PasswordHasher } from '../domain/ports.js';

export function createArgon2Hasher(): PasswordHasher {
  return {
    async hash(password: string) {
      return hash(password, {
        type: argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
    },
    async verify(passwordHash: string, password: string) {
      try {
        return await verify(passwordHash, password);
      } catch {
        return false;
      }
    },
  };
}
