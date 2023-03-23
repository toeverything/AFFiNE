/**
 * @vitest-environment happy-dom
 */
import type { AccessTokenMessage } from '@affine/workspace/affine/login';
import {
  getLoginStorage,
  isExpired,
  setLoginStorage,
  STORAGE_KEY,
} from '@affine/workspace/affine/login';
import { describe, expect, test } from 'vitest';

describe('storage', () => {
  test('should work', () => {
    setLoginStorage({
      token: '1',
      refresh: '2',
    });
    const data = localStorage.getItem(STORAGE_KEY);
    expect(data).toBe('{"token":"1","refresh":"2"}');
    const login = getLoginStorage();
    expect(login).toEqual({
      token: '1',
      refresh: '2',
    });
  });
});

describe('utils', () => {
  test('isExpired', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isExpired({ exp: now + 1 } as AccessTokenMessage)).toBeFalsy();
    const promise = new Promise<void>(resolve => {
      setTimeout(() => {
        expect(isExpired({ exp: now + 1 } as AccessTokenMessage)).toBeTruthy();
        resolve();
      }, 2000);
    });
    expect(isExpired({ exp: now - 1 } as AccessTokenMessage)).toBeTruthy();
    await promise;
  });
});
