import { errors } from '../domain/errors.js';
import type {
  DevicePlatform,
  Session,
  User,
  UserFeature,
} from '../domain/identity.js';
import type {
  Clock,
  IdentityStore,
  OauthAccountStore,
  PasswordHasher,
} from '../domain/ports.js';
import type { SsoProfile } from '../domain/sso.js';
import type { AuditService } from './audit-service.js';
import type { SecurityPolicyService } from './security-policy-service.js';
import {
  displayNameFromEmail,
  isValidEmail,
  normalizeEmail,
  randomToken,
  sha256,
} from './crypto.js';

export interface AuthConfig {
  allowSignup: boolean;
  passwordMinLength: number;
  passwordMaxLength: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  accessTtlMs: number;
  refreshTtlMs: number;
  exchangeTtlMs: number;
}

export interface SignInResult {
  user: User;
  session: Session;
  cookieToken: string;
  exchangeCode: string | null;
}

export interface TokenPair {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  session: { id: string; absoluteExpiresAt: string };
}

export interface BoundAuthMethods {
  password: { bound: boolean };
  oauth: { bound: boolean; providers: string[] };
  passkey: { bound: boolean; count: number };
}

export interface PreflightResult {
  registered: boolean;
  methods: {
    password: { available: boolean };
    magicLink: { available: boolean };
    oauth: { available: boolean; providers: string[] };
    passkey: { available: boolean; discoverable: boolean };
  };
}

const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export interface AuthExtras {
  audit?: AuditService;
  oauth?: OauthAccountStore;
  policy?: SecurityPolicyService;
  oauthProviders?: () => string[];
}

export class AuthService {
  constructor(
    private readonly store: IdentityStore,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly config: AuthConfig,
    private readonly extras: AuthExtras = {}
  ) {}

  async isInitialized(): Promise<boolean> {
    return (await this.store.countUsers()) > 0;
  }

  async preflight(email: string): Promise<PreflightResult> {
    if (!isValidEmail(email)) {
      throw errors.invalidEmail();
    }
    const user = await this.store.findUserByEmail(normalizeEmail(email));
    const credential = user ? await this.store.getCredential(user.id) : null;
    const providers = this.extras.oauthProviders?.() ?? [];
    const passwordAvailable = user
      ? credential !== null
      : this.config.allowSignup;
    return {
      registered: user !== null,
      methods: {
        password: { available: passwordAvailable },
        magicLink: { available: false },
        oauth: { available: providers.length > 0, providers },
        passkey: { available: false, discoverable: false },
      },
    };
  }

  async signInPassword(input: {
    email: string;
    password: string;
    clientKind: 'web' | 'native';
    appVersion?: string | null;
  }): Promise<SignInResult> {
    if (!isValidEmail(input.email)) {
      throw errors.invalidEmail();
    }
    if (!input.password) {
      throw errors.passwordRequired();
    }
    this.assertPasswordLength(input.password);

    const email = normalizeEmail(input.email);
    try {
      await this.extras.policy?.assertPasswordAllowed(email);
    } catch (error) {
      await this.extras.audit?.record({
        action: 'auth.sign_in_failed',
        metadata: { email, reason: 'sso_required' },
      });
      throw error;
    }
    const existing = await this.store.findUserByEmail(email);

    if (!existing) {
      if (!this.config.allowSignup) {
        await this.hasher.verify(DUMMY_HASH, input.password);
        await this.extras.audit?.record({
          action: 'auth.sign_in_failed',
          metadata: { email, reason: 'unknown_user' },
        });
        throw errors.wrongCredentials();
      }
      const user = await this.register(email, input.password);
      return this.issueSession(user, input.clientKind, input.appVersion);
    }

    const credential = await this.store.getCredential(existing.id);
    if (!credential) {
      await this.extras.audit?.record({
        actorId: existing.id,
        action: 'auth.sign_in_failed',
        metadata: { email, reason: 'no_password' },
      });
      throw errors.wrongCredentials();
    }
    const ok = await this.hasher.verify(
      credential.passwordHash,
      input.password
    );
    if (!ok) {
      await this.extras.audit?.record({
        actorId: existing.id,
        action: 'auth.sign_in_failed',
        metadata: { email, reason: 'bad_password' },
      });
      throw errors.wrongCredentials();
    }
    const signed = await this.issueSession(
      existing,
      input.clientKind,
      input.appVersion
    );
    await this.extras.audit?.record({
      actorId: existing.id,
      action: 'auth.sign_in',
      metadata: { method: 'password' },
    });
    return signed;
  }

  async createAdmin(input: {
    name: string;
    email: string;
    password: string;
    clientKind: 'web' | 'native';
  }): Promise<SignInResult> {
    if (await this.isInitialized()) {
      throw errors.actionForbidden('Server is already initialized.');
    }
    if (!isValidEmail(input.email)) {
      throw errors.invalidEmail();
    }
    this.assertPasswordLength(input.password);
    const name = input.name.trim();
    if (name.length === 0) {
      throw errors.badRequest('Name is required.');
    }
    const user = await this.register(
      normalizeEmail(input.email),
      input.password,
      name,
      ['Admin']
    );
    return this.issueSession(user, input.clientKind, null);
  }

  async authenticateCookie(token: string | undefined): Promise<Session | null> {
    if (!token) {
      return null;
    }
    return this.liveSession(
      await this.store.findSessionByTokenHash(sha256(token))
    );
  }

  async authenticateBearer(token: string | undefined): Promise<Session | null> {
    if (!token) {
      return null;
    }
    const session = await this.store.findSessionByAccessHash(sha256(token));
    const live = await this.liveSession(session);
    if (!live) {
      return null;
    }
    if (
      !live.accessExpiresAt ||
      live.accessExpiresAt.getTime() <= this.clock.now().getTime()
    ) {
      throw errors.accessTokenExpired();
    }
    return live;
  }

  async authenticateHandshake(input: {
    cookieToken?: string | undefined;
    bearerToken?: string | undefined;
  }): Promise<Session | null> {
    if (input.bearerToken) {
      return this.authenticateBearer(input.bearerToken);
    }
    return this.authenticateCookie(input.cookieToken);
  }

  async requireUser(session: Session | null): Promise<User> {
    if (!session) {
      throw errors.authenticationRequired();
    }
    const user = await this.store.findUserById(session.userId);
    if (!user) {
      throw errors.authenticationRequired();
    }
    return user;
  }

  async getUser(session: Session | null): Promise<User | null> {
    if (!session) {
      return null;
    }
    return this.store.findUserById(session.userId);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.store.findUserById(id);
  }

  async boundMethods(user: User): Promise<BoundAuthMethods> {
    const credential = await this.store.getCredential(user.id);
    const providers = this.extras.oauth
      ? await this.extras.oauth.listOauthProviders(user.id)
      : [];
    return {
      password: { bound: credential !== null },
      oauth: { bound: providers.length > 0, providers },
      passkey: { bound: false, count: 0 },
    };
  }

  async hasPassword(user: User): Promise<boolean> {
    return (await this.store.getCredential(user.id)) !== null;
  }

  requireInstanceAdmin(user: User): void {
    if (!user.features.includes('Admin')) {
      throw errors.accessDenied();
    }
  }

  async completeSso(
    profile: SsoProfile,
    clientKind: 'web' | 'native'
  ): Promise<SignInResult> {
    const email = normalizeEmail(profile.email);
    if (!isValidEmail(email)) {
      throw errors.invalidEmail();
    }
    const linked = this.extras.oauth
      ? await this.extras.oauth.findOauthAccount(
          profile.provider,
          profile.providerAccountId
        )
      : null;
    let user = linked
      ? await this.store.findUserById(linked.userId)
      : await this.store.findUserByEmail(email);
    if (!user) {
      const now = this.clock.now();
      const isFirst = (await this.store.countUsers()) === 0;
      user = await this.store.createUser(
        {
          id: crypto.randomUUID(),
          email,
          name: profile.name || displayNameFromEmail(email),
          emailVerified: true,
          avatarUrl: null,
          features: isFirst ? ['Admin'] : [],
          createdAt: now,
          updatedAt: now,
        },
        null
      );
    }
    if (this.extras.oauth && !linked) {
      await this.extras.oauth.linkOauthAccount({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      });
    }
    const result = await this.issueSession(user, clientKind, null);
    await this.extras.audit?.record({
      actorId: user.id,
      actorType: 'sso',
      action: 'auth.sso_login',
      metadata: { provider: profile.provider },
    });
    return result;
  }

  async signOut(session: Session | null): Promise<void> {
    if (!session) {
      return;
    }
    await this.store.revokeSession(session.id, this.clock.now());
    await this.extras.audit?.record({
      actorId: session.userId,
      action: 'auth.sign_out',
    });
  }

  async listDeviceSessions(user: User, currentId: string) {
    const now = this.clock.now();
    const sessions = await this.store.listSessionsByUser(user.id);
    return sessions
      .filter(session => !session.revokedAt)
      .filter(
        session =>
          session.absoluteExpiresAt.getTime() > now.getTime() &&
          session.idleExpiresAt.getTime() > now.getTime()
      )
      .map(session => ({
        id: session.id,
        installationId: session.installationId ?? '',
        platform: (session.platform ?? 'electron') as Exclude<
          DevicePlatform,
          'web'
        >,
        deviceName: session.deviceName,
        appVersion: session.appVersion,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
        current: session.id === currentId,
      }));
  }

  async revokeDeviceSession(user: User, sessionId: string): Promise<boolean> {
    const session = await this.store.findSessionById(sessionId);
    if (!session || session.userId !== user.id) {
      return false;
    }
    await this.store.revokeSession(sessionId, this.clock.now());
    return session.id === sessionId;
  }

  async revokeAllOtherSessions(user: User, currentId: string): Promise<void> {
    await this.store.revokeOtherSessions(user.id, currentId, this.clock.now());
  }

  async exchange(input: {
    code: string;
    installationId: string;
    platform: DevicePlatform;
    deviceName?: string | null;
  }): Promise<TokenPair> {
    const session = await this.store.findSessionByExchangeHash(
      sha256(input.code)
    );
    if (
      !session ||
      session.revokedAt ||
      !session.exchangeExpiresAt ||
      session.exchangeExpiresAt.getTime() <= this.clock.now().getTime()
    ) {
      throw errors.invalidAuthState();
    }
    return this.issueTokens(session, {
      installationId: input.installationId,
      platform: input.platform,
      deviceName: input.deviceName ?? null,
      clearCookieToken: true,
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const session = await this.store.findSessionByRefreshHash(
      sha256(refreshToken)
    );
    if (!session || session.revokedAt) {
      throw errors.refreshTokenInvalid();
    }
    if (
      !session.refreshExpiresAt ||
      session.refreshExpiresAt.getTime() <= this.clock.now().getTime()
    ) {
      await this.store.revokeSession(session.id, this.clock.now());
      throw errors.sessionExpired();
    }
    if (!(await this.liveSession(session))) {
      throw errors.sessionExpired();
    }
    return this.issueTokens(session, {});
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const session = await this.store.findSessionByRefreshHash(
      sha256(refreshToken)
    );
    if (session) {
      await this.store.revokeSession(session.id, this.clock.now());
    }
  }

  private async register(
    email: string,
    password: string,
    name?: string,
    features?: UserFeature[]
  ): Promise<User> {
    if (await this.store.findUserByEmail(email)) {
      throw errors.emailAlreadyUsed();
    }
    const now = this.clock.now();
    const isFirst = (await this.store.countUsers()) === 0;
    const user: User = {
      id: crypto.randomUUID(),
      email,
      name: name ?? displayNameFromEmail(email),
      emailVerified: true,
      avatarUrl: null,
      features: features ?? (isFirst ? ['Admin'] : []),
      createdAt: now,
      updatedAt: now,
    };
    const passwordHash = await this.hasher.hash(password);
    return this.store.createUser(user, passwordHash);
  }

  private async issueSession(
    user: User,
    clientKind: 'web' | 'native',
    appVersion: string | null | undefined
  ): Promise<SignInResult> {
    const now = this.clock.now();
    let absoluteMs = this.config.absoluteTtlMs;
    let idleMs = this.config.idleTtlMs;
    const policy = await this.extras.policy?.get(null);
    if (policy?.sessionMaxDurationSec && policy.sessionMaxDurationSec > 0) {
      const cap = policy.sessionMaxDurationSec * 1000;
      absoluteMs = Math.min(absoluteMs, cap);
      idleMs = Math.min(idleMs, cap);
    }
    const cookieToken = randomToken();
    const csrfToken = randomToken(24);
    const exchangeCode = clientKind === 'native' ? randomToken() : null;
    const session: Session = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: sha256(cookieToken),
      csrfToken,
      refreshTokenHash: null,
      refreshExpiresAt: null,
      accessTokenHash: null,
      accessExpiresAt: null,
      exchangeCodeHash: exchangeCode ? sha256(exchangeCode) : null,
      exchangeExpiresAt: exchangeCode
        ? new Date(now.getTime() + this.config.exchangeTtlMs)
        : null,
      installationId: null,
      platform: clientKind === 'native' ? 'electron' : 'web',
      deviceName: null,
      appVersion: appVersion ?? null,
      idleExpiresAt: new Date(now.getTime() + idleMs),
      absoluteExpiresAt: new Date(now.getTime() + absoluteMs),
      revokedAt: null,
      createdAt: now,
      lastSeenAt: now,
    };
    await this.store.createSession(session);
    return { user, session, cookieToken, exchangeCode };
  }

  private async issueTokens(
    session: Session,
    extra: {
      installationId?: string;
      platform?: DevicePlatform;
      deviceName?: string | null;
      clearCookieToken?: boolean;
    }
  ): Promise<TokenPair> {
    const now = this.clock.now();
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const accessExpiresAt = new Date(now.getTime() + this.config.accessTtlMs);
    const refreshExpiresAt = new Date(now.getTime() + this.config.refreshTtlMs);
    const updated = await this.store.updateSession(session.id, {
      accessTokenHash: sha256(accessToken),
      accessExpiresAt,
      refreshTokenHash: sha256(refreshToken),
      refreshExpiresAt,
      exchangeCodeHash: null,
      exchangeExpiresAt: null,
      tokenHash: extra.clearCookieToken ? null : session.tokenHash,
      installationId: extra.installationId ?? session.installationId,
      platform: extra.platform ?? session.platform,
      deviceName: extra.deviceName ?? session.deviceName,
      lastSeenAt: now,
      idleExpiresAt: new Date(now.getTime() + this.config.idleTtlMs),
    });
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: Math.floor(this.config.accessTtlMs / 1000),
      refreshToken,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      session: {
        id: updated.id,
        absoluteExpiresAt: updated.absoluteExpiresAt.toISOString(),
      },
    };
  }

  private async liveSession(session: Session | null): Promise<Session | null> {
    if (!session || session.revokedAt) {
      return null;
    }
    const now = this.clock.now();
    if (session.absoluteExpiresAt.getTime() <= now.getTime()) {
      return null;
    }
    if (session.idleExpiresAt.getTime() <= now.getTime()) {
      return null;
    }
    const idleExpiresAt = new Date(now.getTime() + this.config.idleTtlMs);
    return this.store.updateSession(session.id, {
      lastSeenAt: now,
      idleExpiresAt,
    });
  }

  private assertPasswordLength(password: string): void {
    if (
      password.length < this.config.passwordMinLength ||
      password.length > this.config.passwordMaxLength
    ) {
      throw errors.invalidPasswordLength(
        this.config.passwordMinLength,
        this.config.passwordMaxLength
      );
    }
  }
}

export function publicUser(user: User, hasPassword = true) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    hasPassword: hasPassword as boolean | null,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
  };
}
