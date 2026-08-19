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
  let revalidationPromise: Promise<void> | null = null;
  let lastRevalidationStartedAt = 0;

  const waitForSessionRevalidation = async (
    authService: NativeUserIdentifierAuthService
  ) => {
    const now = Date.now();

    if (revalidationPromise) {
      await revalidationPromise;
      return;
    }

    if (now - lastRevalidationStartedAt < revalidationCooldownMs) {
      return;
    }

    lastRevalidationStartedAt = now;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      revalidationTimeoutMs
    );

    revalidationPromise = authService.session
      .waitForRevalidation(controller.signal)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timeoutId);
        revalidationPromise = null;
      });

    await revalidationPromise;
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
