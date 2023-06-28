/**
 * @vitest-environment node
 */
import { loginResponseSchema } from '@affine/workspace/affine/login';
import type { affineApis as API } from '@affine/workspace/affine/shared';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let affineApis: typeof API;

beforeAll(async () => {
  // @ts-expect-error
  globalThis.window = undefined;
  affineApis = (await import('@affine/workspace/affine/shared')).affineApis;
});

describe('apis', () => {
  it('should defined', async () => {
    expect(affineApis).toBeDefined();
    expect(affineApis).toBe(globalThis.AFFINE_APIS);
  });

  it('login mock user', async () => {
    const setItem = vi.fn((key: string, value: unknown) => {
      expect(key).toBe('affine-login-v2');
      expect(value).toBeTypeOf('string');
      loginResponseSchema.parse(JSON.parse(value as string));
    });
    vi.stubGlobal('localStorage', {
      setItem,
    });
    expect(globalThis.AFFINE_DEBUG).toBeDefined();
    expect(globalThis.AFFINE_DEBUG.loginMockUser1).toBeTypeOf('function');
    expect(globalThis.AFFINE_DEBUG.loginMockUser2).toBeTypeOf('function');
    await (globalThis.AFFINE_DEBUG.loginMockUser1 as () => Promise<unknown>)();
    await (globalThis.AFFINE_DEBUG.loginMockUser2 as () => Promise<unknown>)();
    expect(setItem).toBeCalledTimes(2);
  });
});
