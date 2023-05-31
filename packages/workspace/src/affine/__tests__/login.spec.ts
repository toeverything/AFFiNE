/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test } from 'vitest';

import type { AccessTokenMessage } from '../login';
import {
  getLoginStorage,
  isExpired,
  setLoginStorage,
  STORAGE_KEY,
} from '../login';

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
    expect(isExpired({ exp: now + 1 } as AccessTokenMessage, 0)).toBeFalsy();
    const promise = new Promise<void>(resolve => {
      setTimeout(() => {
        expect(
          isExpired({ exp: now + 1 } as AccessTokenMessage, 0)
        ).toBeTruthy();
        resolve();
      }, 2000);
    });
    expect(isExpired({ exp: now - 1 } as AccessTokenMessage, 0)).toBeTruthy();
    await promise;
  });
});
