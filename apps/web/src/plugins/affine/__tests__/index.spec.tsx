/**
 * @vitest-environment happy-dom
 */
import {
  getLoginStorage,
  isExpired,
  loginResponseSchema,
  parseIdToken,
  setLoginStorage,
} from '@affine/workspace/affine/login';
import user1 from '@affine-test/fixtures/built-in-user1.json';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { useAffineRefreshAuthToken } from '../../../hooks/affine/use-affine-refresh-auth-token';

afterEach(() => {
  localStorage.clear();
});

describe('AFFiNE workspace', () => {
  test('Provider', async () => {
    expect(getLoginStorage()).toBeNull();
    const data = await fetch('http://127.0.0.1:3000/api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugLoginUser',
        email: user1.email,
        password: user1.password,
      }),
    }).then(r => r.json());
    loginResponseSchema.parse(data);
    setLoginStorage({
      // expired token that already expired
      token:
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2ODA4MjE0OTQsImlkIjoiaFd0dkFoM1E3SGhiWVlNeGxyX1I0IiwibmFtZSI6ImRlYnVnMSIsImVtYWlsIjoiZGVidWcxQHRvZXZlcnl0aGluZy5pbmZvIiwiYXZhdGFyX3VybCI6bnVsbCwiY3JlYXRlZF9hdCI6MTY4MDgxNTcxMTAwMH0.fDSkbM-ovmGD21sKYSTuiqC1dTiceOfcgIUfI2dLsBk',
      // but refresh is still valid
      refresh: data.refresh,
    });
    const hook = renderHook(() => useAffineRefreshAuthToken(1));
    await new Promise(resolve => setTimeout(resolve, 3000));
    const userData = parseIdToken(getLoginStorage()?.token as string);
    expect(userData).not.toBeNull();
    expect(isExpired(userData)).toBe(false);
    hook.unmount();
  });
});
