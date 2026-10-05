import type { AuthService } from '../../modules/cloud/services/auth';

export interface NativeUserIdentifierAuthService {
  session: Pick<AuthService['session'], 'account$' | 'waitForRevalidation'>;
}

interface NativeUserIdentifierResolverOptions {
  revalidationTimeoutMs?: number;
  revalidationCooldownMs?: number;
}

const getAccountIdentifier = (identifier: string | null | undefined) => {
  const trimmedIdentifier = identifier?.trim();
  return trimmedIdentifier ? trimmedIdentifier : null;
};

export const createNativeUserIdentifierResolver = ({
  revalidationTimeoutMs = 1500,
  revalidationCooldownMs = 1000,
}: NativeUserIdentifierResolverOptions = {}) => {
  const revalidationStates = new WeakMap<
    NativeUserIdentifierAuthService,
    {
      promise: Promise<void> | null;
      lastStartedAt: number;
    }
  >();

  const getRevalidationState = (
    authService: NativeUserIdentifierAuthService
  ) => {
    const existing = revalidationStates.get(authService);
    if (existing) {
      return existing;
    }

    const state = {
      promise: null,
      lastStartedAt: 0,
    };
    revalidationStates.set(authService, state);
    return state;
  };

  const waitForSessionRevalidation = async (
    authService: NativeUserIdentifierAuthService
  ) => {
    const state = getRevalidationState(authService);
    const now = Date.now();

    if (state.promise) {
      await state.promise;
      return;
    }

    if (now - state.lastStartedAt < revalidationCooldownMs) {
      return;
    }

    state.lastStartedAt = now;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      revalidationTimeoutMs
    );

    state.promise = authService.session
      .waitForRevalidation(controller.signal)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timeoutId);
        state.promise = null;
      });

    await state.promise;
  };

  return async (authService: NativeUserIdentifierAuthService) => {
    const cachedIdentifier = getAccountIdentifier(
      authService.session.account$.value?.id
    );
    if (cachedIdentifier) {
      return cachedIdentifier;
    }

    await waitForSessionRevalidation(authService);

    return getAccountIdentifier(authService.session.account$.value?.id);
  };
};

export const getCurrentNativeUserIdentifier =
  createNativeUserIdentifierResolver();
