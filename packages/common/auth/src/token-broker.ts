export const PERMANENT_AUTH_CODES = new Set([
  'ACCESS_TOKEN_INVALID',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'UNSUPPORTED_CLIENT_VERSION',
]);
const PUBLIC_AUTH_CODES = new Set([
  ...PERMANENT_AUTH_CODES,
  'ACCESS_TOKEN_EXPIRED',
  'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
  'AUTH_TOKEN_RESPONSE_INVALID',
  'AUTH_TOKEN_STORAGE_UNAVAILABLE',
  'FORBIDDEN',
  'NETWORK_ERROR',
  'TOO_MANY_REQUESTS',
]);
const SAFE_AUTH_CODES = new Set([
  ...PUBLIC_AUTH_CODES,
  'AUTH_OPERATION_CANCELLED',
  'AUTH_SESSION_EMPTY',
]);

export interface AuthTokenPair {
  version: 1;
  tokenType: 'Bearer';
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  session: {
    id: string;
    absoluteExpiresAt: string;
  };
}

export interface AuthTokenResponse {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  session: AuthTokenPair['session'];
}

export interface AuthSessionSnapshot {
  accessExpiresAt: string;
  refreshExpiresAt: string;
  session: AuthTokenPair['session'];
}

export interface AuthAccessToken extends AuthSessionSnapshot {
  accessToken: string;
}

export type AuthState =
  | { status: 'initializing' }
  | { status: 'empty' }
  | { status: 'authenticated'; session: AuthSessionSnapshot }
  | { status: 'refreshing'; session: AuthSessionSnapshot; reason: string }
  | {
      status: 'offline-authenticated';
      session: AuthSessionSnapshot;
      code: string;
    }
  | { status: 'revoked'; code: string };

export interface AuthTokenStorage {
  load(): Promise<AuthTokenPair | null>;
  save(pair: AuthTokenPair): Promise<void>;
  clear(): Promise<void>;
}

export interface AuthTokenTransport {
  refresh(refreshToken: string): Promise<AuthTokenResponse>;
}

export interface AuthTokenBrokerContract {
  getValidAccessToken(minValidity?: number): Promise<string | null>;
  refresh(reason: string): Promise<AuthAccessToken>;
  clear(reason: string): Promise<void>;
  observeAuthState(listener: (state: AuthState) => void): () => void;
}

export interface AuthTokenBrokerOptions {
  now?: () => number;
  random?: () => number;
  retryDelays?: number[];
  sleep?: (delay: number) => Promise<void>;
}

export class AuthSessionError extends Error {
  constructor(
    readonly code: string,
    readonly transient: boolean
  ) {
    super(code);
  }
}

export class AuthTokenBroker implements AuthTokenBrokerContract {
  private pair: AuthTokenPair | null = null;
  private initialized: Promise<void> | null = null;
  private refreshPromise: Promise<AuthTokenPair> | null = null;
  private pending: { pair: AuthTokenPair; epoch: number } | null = null;
  private mutationEpoch = 0;
  private storageMutation: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(state: AuthState) => void>();
  private state: AuthState = { status: 'initializing' };
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly retryDelays: number[];
  private readonly sleep: (delay: number) => Promise<void>;

  constructor(
    private readonly storage: AuthTokenStorage,
    private readonly transport: AuthTokenTransport,
    options: AuthTokenBrokerOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.retryDelays = options.retryDelays ?? [250, 1000];
    this.sleep =
      options.sleep ??
      (delay => new Promise(resolve => setTimeout(resolve, delay)));
  }

  observeAuthState(listener: (state: AuthState) => void) {
    this.listeners.add(listener);
    try {
      listener(this.state);
    } catch {
      // Observers cannot participate in credential lifecycle decisions.
    }
    void this.initialize().catch(() => {});
    return () => {
      this.listeners.delete(listener);
    };
  }

  async set(response: AuthTokenResponse) {
    await this.initialize();
    const epoch = ++this.mutationEpoch;
    const pair = this.toPair(response);
    this.pending = { pair, epoch };
    return this.toAccessToken(await this.persistPending());
  }

  async getValidAccessToken(minValidity = 60_000) {
    await this.initialize();
    if (!this.pair) return null;
    if (Date.parse(this.pair.accessExpiresAt) - this.now() <= minValidity) {
      await this.refresh('proactive');
    }
    return this.pair?.accessToken ?? null;
  }

  async refresh(reason: string) {
    await this.initialize();
    if (!this.pair) throw new AuthSessionError('AUTH_SESSION_EMPTY', false);
    if (!this.refreshPromise) {
      this.refreshPromise = (
        this.pending ? this.persistPending() : this.performRefresh(reason)
      ).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.toAccessToken(await this.refreshPromise);
  }

  async clear(_reason: string) {
    await this.initialize();
    ++this.mutationEpoch;
    this.pending = null;
    let failed = false;
    try {
      await this.mutateStorage(() => this.storage.clear());
    } catch {
      failed = true;
    } finally {
      this.pair = null;
      this.publish({ status: 'empty' });
    }
    if (failed) {
      throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
    }
  }

  async revoke(
    _reason: string,
    revokeToken: (refreshToken: string) => Promise<void>
  ) {
    await this.initialize();
    ++this.mutationEpoch;
    this.pending = null;
    const refreshToken = this.pair?.refreshToken;
    let storageError: unknown;
    try {
      await this.mutateStorage(() => this.storage.clear());
    } catch (error) {
      storageError = error;
    } finally {
      this.pair = null;
      this.publish({ status: 'empty' });
    }
    if (refreshToken) await revokeToken(refreshToken);
    if (storageError) {
      throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
    }
  }

  private async initialize() {
    if (!this.initialized) {
      const attempt = Promise.resolve()
        .then(() => this.storage.load())
        .then(async pair => {
          if (pair && !isAuthTokenPair(pair)) {
            await this.mutateStorage(() => this.storage.clear());
            pair = null;
          }
          this.pair = pair;
          this.publish(
            pair
              ? { status: 'authenticated', session: this.toSnapshot(pair) }
              : { status: 'empty' }
          );
        })
        .catch(() => {
          throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
        });
      this.initialized = attempt;
      try {
        await attempt;
      } catch (error) {
        if (this.initialized === attempt) this.initialized = null;
        throw error;
      }
      return;
    }
    await this.initialized;
  }

  private async performRefresh(reason: string) {
    const current = this.pair;
    if (!current) throw new AuthSessionError('AUTH_SESSION_EMPTY', false);
    const epoch = this.mutationEpoch;
    this.publish({
      status: 'refreshing',
      session: this.toSnapshot(current),
      reason,
    });
    try {
      const pair = this.toPair(await this.requestRefresh(current.refreshToken));
      if (epoch !== this.mutationEpoch) {
        throw new AuthSessionError('AUTH_OPERATION_CANCELLED', true);
      }
      this.pending = { pair, epoch };
      return await this.persistPending();
    } catch (error) {
      const classified = classifyAuthError(error);
      if (
        classified.code === 'AUTH_OPERATION_CANCELLED' ||
        epoch !== this.mutationEpoch
      ) {
        throw new AuthSessionError('AUTH_OPERATION_CANCELLED', true);
      }
      if (!classified.transient) {
        try {
          await this.mutateStorage(() => this.storage.clear());
        } catch {
          // The in-memory credential must still become unusable immediately.
        } finally {
          this.pair = null;
          this.publish({ status: 'revoked', code: classified.code });
        }
      } else {
        this.publish({
          status: 'offline-authenticated',
          session: this.toSnapshot(current),
          code: classified.code,
        });
      }
      throw classified;
    }
  }

  private async persistPending() {
    const pending = this.pending;
    if (!pending) throw new AuthSessionError('AUTH_SESSION_EMPTY', false);
    try {
      await this.mutateStorage(() => this.storage.save(pending.pair));
    } catch {
      throw new AuthSessionError('AUTH_TOKEN_STORAGE_UNAVAILABLE', true);
    }
    if (pending.epoch !== this.mutationEpoch) {
      throw new AuthSessionError('AUTH_OPERATION_CANCELLED', true);
    }
    this.pending = null;
    this.pair = pending.pair;
    this.publish({
      status: 'authenticated',
      session: this.toSnapshot(pending.pair),
    });
    return pending.pair;
  }

  private async mutateStorage<T>(operation: () => Promise<T>) {
    const result = this.storageMutation.then(operation, operation);
    this.storageMutation = result.then(
      () => {},
      () => {}
    );
    return await result;
  }

  private async requestRefresh(refreshToken: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.transport.refresh(refreshToken);
      } catch (error) {
        const classified = classifyAuthError(error);
        const delay = this.retryDelays[attempt];
        if (!classified.transient || delay === undefined) throw classified;
        await this.sleep(delay * (0.75 + this.random() * 0.5));
      }
    }
  }

  private toPair(response: AuthTokenResponse): AuthTokenPair {
    const accessExpiresAt = this.now() + response.expiresIn * 1000;
    if (
      !Number.isFinite(response.expiresIn) ||
      response.expiresIn <= 0 ||
      !Number.isFinite(accessExpiresAt) ||
      Math.abs(accessExpiresAt) > 8.64e15
    ) {
      throw new AuthSessionError('AUTH_TOKEN_RESPONSE_INVALID', true);
    }
    const pair: AuthTokenPair = {
      version: 1,
      tokenType: response.tokenType,
      accessToken: response.accessToken,
      accessExpiresAt: new Date(accessExpiresAt).toISOString(),
      refreshToken: response.refreshToken,
      refreshExpiresAt: response.refreshExpiresAt,
      session: response.session,
    };
    if (!isAuthTokenPair(pair)) {
      throw new AuthSessionError('AUTH_TOKEN_RESPONSE_INVALID', true);
    }
    return pair;
  }

  private toSnapshot(pair: AuthTokenPair): AuthSessionSnapshot {
    return {
      accessExpiresAt: pair.accessExpiresAt,
      refreshExpiresAt: pair.refreshExpiresAt,
      session: { ...pair.session },
    };
  }

  private toAccessToken(pair: AuthTokenPair): AuthAccessToken {
    return {
      ...this.toSnapshot(pair),
      accessToken: pair.accessToken,
    };
  }

  private publish(state: AuthState) {
    this.state = state;
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Observers cannot participate in credential lifecycle decisions.
      }
    }
  }
}

export function classifyAuthError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return SAFE_AUTH_CODES.has(error.code)
      ? error
      : new AuthSessionError('AUTH_SESSION_TEMPORARILY_UNAVAILABLE', true);
  }
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE';
  const publicCode = PUBLIC_AUTH_CODES.has(code)
    ? code
    : 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE';
  return new AuthSessionError(
    publicCode,
    !PERMANENT_AUTH_CODES.has(publicCode)
  );
}

export async function withAuthRetry<T>(
  broker: AuthTokenBrokerContract,
  request: (accessToken: string) => Promise<T>
) {
  const token = await broker.getValidAccessToken();
  if (!token) throw new AuthSessionError('AUTH_SESSION_EMPTY', false);
  try {
    return await request(token);
  } catch (error) {
    const classified = classifyAuthError(error);
    if (classified.code !== 'ACCESS_TOKEN_EXPIRED') throw classified;
    const pair = await broker.refresh('access-token-expired');
    return await request(pair.accessToken);
  }
}

export function createRealtimeAuthAdapter(broker: AuthTokenBrokerContract) {
  return {
    getAccessToken: () => broker.getValidAccessToken(120_000),
    recover: async (error: unknown) => {
      const classified = classifyAuthError(error);
      if (classified.code !== 'ACCESS_TOKEN_EXPIRED') throw classified;
      return (await broker.refresh('realtime-access-token-expired'))
        .accessToken;
    },
  };
}

export function createRequestAuthAdapter(broker: AuthTokenBrokerContract) {
  return {
    execute: <T>(request: (accessToken: string) => Promise<T>) =>
      withAuthRetry(broker, request),
  };
}

export function createWorkerAuthAdapter(broker: AuthTokenBrokerContract) {
  return {
    getAccessToken: () => broker.getValidAccessToken(60_000),
  };
}

export function isAuthTokenPair(value: unknown): value is AuthTokenPair {
  if (!value || typeof value !== 'object') return false;
  const pair = value as Partial<AuthTokenPair>;
  return (
    pair.version === 1 &&
    pair.tokenType === 'Bearer' &&
    typeof pair.accessToken === 'string' &&
    pair.accessToken.length > 0 &&
    typeof pair.refreshToken === 'string' &&
    pair.refreshToken.length > 0 &&
    typeof pair.accessExpiresAt === 'string' &&
    Number.isFinite(Date.parse(pair.accessExpiresAt)) &&
    typeof pair.refreshExpiresAt === 'string' &&
    Number.isFinite(Date.parse(pair.refreshExpiresAt)) &&
    !!pair.session &&
    typeof pair.session.id === 'string' &&
    typeof pair.session.absoluteExpiresAt === 'string' &&
    Number.isFinite(Date.parse(pair.session.absoluteExpiresAt))
  );
}
