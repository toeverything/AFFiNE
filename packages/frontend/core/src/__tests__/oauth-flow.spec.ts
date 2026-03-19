import {
  consumeOAuthFlowMode,
  rememberOAuthFlowMode,
  resolveOAuthFlowMode,
} from '@affine/core/desktop/pages/auth/oauth-flow';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('oauth flow mode', () => {
  beforeEach(() => {
    const store = new Map<string, string>();

    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  test('defaults to redirect for missing or unknown values', () => {
    expect(resolveOAuthFlowMode()).toBe('redirect');
    expect(resolveOAuthFlowMode(null)).toBe('redirect');
    expect(resolveOAuthFlowMode('unknown')).toBe('redirect');
  });

  test('consumes the remembered flow mode once', () => {
    rememberOAuthFlowMode('popup');

    expect(consumeOAuthFlowMode()).toBe('popup');
    expect(consumeOAuthFlowMode()).toBe('redirect');
  });
});
