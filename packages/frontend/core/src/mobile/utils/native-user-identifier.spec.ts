import { LiveData } from '@toeverything/infra';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { NativeUserIdentifierAuthService } from './native-user-identifier';
import { createNativeUserIdentifierResolver } from './native-user-identifier';

const createAuthService = (
  accountId: string | null,
  waitForRevalidation: NativeUserIdentifierAuthService['session']['waitForRevalidation']
): NativeUserIdentifierAuthService => ({
  session: {
    account$: new LiveData(
      accountId
        ? {
            id: accountId,
            label: 'Test User',
          }
        : null
    ),
    waitForRevalidation,
  },
});

describe('createNativeUserIdentifierResolver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns the cached identifier without revalidating', async () => {
    const waitForRevalidation = vi.fn().mockResolvedValue(undefined);
    const resolveCurrentUserIdentifier = createNativeUserIdentifierResolver();
    const authService = createAuthService('user-id', waitForRevalidation);

    await expect(resolveCurrentUserIdentifier(authService)).resolves.toBe(
      'user-id'
    );
    expect(waitForRevalidation).not.toHaveBeenCalled();
  });

  test('reuses the same in-flight revalidation across concurrent lookups', async () => {
    let resolveRevalidation: () => void = () => {
      throw new Error('Revalidation promise was not created');
    };
    const waitForRevalidation = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveRevalidation = () => {
            authService.session.account$.value = {
              id: 'user-id',
              label: 'Test User',
            };
            resolve();
          };
        })
    );
    const resolveCurrentUserIdentifier = createNativeUserIdentifierResolver({
      revalidationCooldownMs: 0,
    });
    const authService = createAuthService(null, waitForRevalidation);

    const firstLookup = resolveCurrentUserIdentifier(authService);
    const secondLookup = resolveCurrentUserIdentifier(authService);

    expect(waitForRevalidation).toHaveBeenCalledTimes(1);

    resolveRevalidation();

    await expect(firstLookup).resolves.toBe('user-id');
    await expect(secondLookup).resolves.toBe('user-id');
  });

  test('skips immediate repeat revalidation attempts after an unresolved miss', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'));

    const waitForRevalidation = vi.fn().mockResolvedValue(undefined);
    const resolveCurrentUserIdentifier = createNativeUserIdentifierResolver({
      revalidationCooldownMs: 1000,
      revalidationTimeoutMs: 1000,
    });
    const authService = createAuthService(null, waitForRevalidation);

    await expect(resolveCurrentUserIdentifier(authService)).resolves.toBeNull();
    await expect(resolveCurrentUserIdentifier(authService)).resolves.toBeNull();

    expect(waitForRevalidation).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);

    await expect(resolveCurrentUserIdentifier(authService)).resolves.toBeNull();
    expect(waitForRevalidation).toHaveBeenCalledTimes(2);
  });

  test('keeps revalidation cooldown scoped to each auth service', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'));

    const firstWaitForRevalidation = vi.fn().mockResolvedValue(undefined);
    const secondWaitForRevalidation = vi.fn().mockImplementation(() => {
      secondAuthService.session.account$.value = {
        id: 'second-user-id',
        label: 'Second User',
      };
      return Promise.resolve();
    });
    const resolveCurrentUserIdentifier = createNativeUserIdentifierResolver({
      revalidationCooldownMs: 1000,
      revalidationTimeoutMs: 1000,
    });
    const firstAuthService = createAuthService(null, firstWaitForRevalidation);
    const secondAuthService = createAuthService(
      null,
      secondWaitForRevalidation
    );

    await expect(
      resolveCurrentUserIdentifier(firstAuthService)
    ).resolves.toBeNull();
    await expect(resolveCurrentUserIdentifier(secondAuthService)).resolves.toBe(
      'second-user-id'
    );

    expect(firstWaitForRevalidation).toHaveBeenCalledTimes(1);
    expect(secondWaitForRevalidation).toHaveBeenCalledTimes(1);
  });
});
