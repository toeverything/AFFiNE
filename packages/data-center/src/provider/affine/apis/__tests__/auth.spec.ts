import { describe, expect, test } from 'vitest';

import { Auth } from '../auth';

describe('class Auth', () => {
  test('parse tokens', () => {
    const tokenString = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2NzU2Nzk1MjAsImlkIjo2LCJuYW1lIjoidGVzdCIsImVtYWlsIjoidGVzdEBnbWFpbC5jb20iLCJhdmF0YXJfdXJsIjoiaHR0cHM6Ly90ZXN0LmNvbS9hdmF0YXIiLCJjcmVhdGVkX2F0IjoxNjc1Njc4OTIwMzU4fQ.R8GxrNhn3gNumtapthrP6_J5eQjXLV7i-LanSPqe7hw`;
    expect(Auth.parseIdToken(tokenString)).toEqual({
      avatar_url: 'https://test.com/avatar',
      created_at: 1675678920358,
      email: 'test@gmail.com',
      exp: 1675679520,
      id: 6,
      name: 'test',
    });
  });

  test('parse invalid tokens', () => {
    const tokenString = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.aaa.R8GxrNhn3gNumtapthrP6_J5eQjXLV7i-LanSPqe7hw`;
    expect(Auth.parseIdToken(tokenString)).toEqual(null);
  });
});
