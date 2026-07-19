import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import {
  ActionForbidden,
  Config,
  CryptoHelper,
  EventBus,
  InvalidAppConfigInput,
  OnEvent,
} from '../../base';
import { Models } from '../../models';

const SIGNING_KEY_STORE_ID = 'auth.session.signingKeys';
const CLOCK_SKEW_SECONDS = 30;
const signingKeySchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    secret: z.string().min(1),
    status: z.enum(['active', 'retiring']),
    createdAt: z.string().datetime().optional(),
    source: z.enum(['auto', 'admin']),
    retiredAt: z.string().datetime().optional(),
    verifyUntil: z.string().datetime().optional(),
  })
  .strict();
const signingKeysSchema = z.array(signingKeySchema);

type PersistedAuthSigningKey = z.infer<typeof signingKeySchema>;

export interface AuthSigningKey {
  id: string;
  secret: Buffer;
  status: 'active' | 'retiring';
  createdAt?: Date;
  source: 'auto' | 'admin';
  retiredAt?: Date;
  verifyUntil?: Date;
}

export interface AuthSigningKeyMetadata {
  id: string;
  status: 'active' | 'retiring';
  createdAt?: Date;
  source: 'auto' | 'admin';
  retiredAt?: Date;
  verifyUntil?: Date;
  canDelete: boolean;
}

declare global {
  interface Events {
    'auth.signing_keys.changed': Record<string, never>;
    'auth.signing_key.rotated': {
      actorId: string;
      previousKeyId: string;
      activeKeyId: string;
    };
    'auth.signing_key.deleted': {
      actorId: string;
      keyId: string;
    };
  }
}

@Injectable()
export class AuthSigningKeyRing {
  private readonly logger = new Logger(AuthSigningKeyRing.name);
  private snapshot: AuthSigningKey[] | undefined;

  constructor(
    private readonly config: Config,
    private readonly crypto: CryptoHelper,
    private readonly models: Models,
    private readonly event: EventBus
  ) {}

  @OnEvent('config.init', { prepend: true })
  async onConfigInit() {
    const stored = await this.models.appConfig.createIfAbsent(
      SIGNING_KEY_STORE_ID,
      [this.generate('auto')]
    );
    this.applyPersisted(stored.value);
    this.logger.log('Initialized auth signing key ring from the database.');
  }

  @OnEvent('auth.signing_keys.changed')
  async onSigningKeysChanged() {
    await this.reconcile();
  }

  async active() {
    await this.reconcile();
    const active = this.keys().find(key => key.status === 'active');
    if (!active) {
      throw new Error('Auth session requires exactly one active signing key.');
    }
    return active;
  }

  async verify(id: string, now = new Date()) {
    await this.reconcile();
    return this.keys().find(
      key =>
        key.id === id &&
        (key.status === 'active' ||
          (!!key.verifyUntil && key.verifyUntil >= now))
    );
  }

  async metadata(): Promise<AuthSigningKeyMetadata[]> {
    await this.reconcile();
    return this.snapshotMetadata();
  }

  private snapshotMetadata(): AuthSigningKeyMetadata[] {
    const now = new Date();
    return this.keys().map(({ secret: _, ...key }) => ({
      ...key,
      canDelete:
        key.status === 'retiring' && !!key.verifyUntil && key.verifyUntil < now,
    }));
  }

  async rotate(actorId: string, expectedActiveKeyId: string) {
    const replacement = this.generate('admin');
    const now = new Date();
    const verifyUntil = new Date(
      now.getTime() +
        (this.config.auth.token.accessTokenTtl + CLOCK_SKEW_SECONDS) * 1000
    );
    const updated = await this.models.appConfig.mutate(
      SIGNING_KEY_STORE_ID,
      actorId,
      value => {
        const current = this.parse(value);
        const active = current.find(key => key.status === 'active');
        if (!active) {
          throw new Error(
            'Auth session requires exactly one active signing key.'
          );
        }
        if (active.id !== expectedActiveKeyId) {
          throw new InvalidAppConfigInput({
            message: 'The active signing key changed. Reload and try again.',
          });
        }
        return [
          ...current.map(key =>
            key.status === 'active'
              ? {
                  ...key,
                  status: 'retiring' as const,
                  retiredAt: now.toISOString(),
                  verifyUntil: verifyUntil.toISOString(),
                }
              : key
          ),
          replacement,
        ];
      }
    );
    this.applyPersisted(updated.value);
    this.event.emit('auth.signing_key.rotated', {
      actorId,
      previousKeyId: expectedActiveKeyId,
      activeKeyId: replacement.id,
    });
    this.event.broadcast('auth.signing_keys.changed', {});
    return this.snapshotMetadata();
  }

  async delete(actorId: string, keyId: string) {
    const now = new Date();
    const updated = await this.models.appConfig.mutate(
      SIGNING_KEY_STORE_ID,
      actorId,
      value => {
        const current = this.parse(value);
        const key = current.find(key => key.id === keyId);
        if (!key) {
          throw new InvalidAppConfigInput({
            message: 'Signing key does not exist.',
          });
        }
        if (
          key.status !== 'retiring' ||
          !key.verifyUntil ||
          new Date(key.verifyUntil) >= now
        ) {
          throw new ActionForbidden();
        }
        return current.filter(key => key.id !== keyId);
      }
    );
    this.applyPersisted(updated.value);
    this.event.emit('auth.signing_key.deleted', { actorId, keyId });
    this.event.broadcast('auth.signing_keys.changed', {});
    return this.snapshotMetadata();
  }

  private applyPersisted(value: unknown) {
    const persisted = this.parse(value);
    this.replaceSnapshot(persisted);
  }

  private replaceSnapshot(keys: unknown) {
    const persisted = this.parse(keys);
    this.snapshot = persisted.map(key => {
      const secret = Buffer.from(key.secret, 'base64url');
      return {
        id: key.id,
        secret,
        status: key.status,
        createdAt: key.createdAt ? new Date(key.createdAt) : undefined,
        source: key.source,
        retiredAt: key.retiredAt ? new Date(key.retiredAt) : undefined,
        verifyUntil: key.verifyUntil ? new Date(key.verifyUntil) : undefined,
      };
    });
  }

  private parse(value: unknown) {
    const keys = signingKeysSchema.parse(value);
    const ids = new Set(keys.map(key => key.id));
    if (ids.size !== keys.length) {
      throw new Error('Auth session signing key ids must be unique.');
    }
    if (keys.filter(key => key.status === 'active').length !== 1) {
      throw new Error('Auth session requires exactly one active signing key.');
    }
    for (const key of keys) {
      const secret = Buffer.from(key.secret, 'base64url');
      if (secret.length < 32 || secret.toString('base64url') !== key.secret) {
        throw new Error(
          `Auth session signing key ${key.id} must be canonical base64url containing at least 32 bytes.`
        );
      }
      if (key.status === 'retiring' && (!key.retiredAt || !key.verifyUntil)) {
        throw new Error(
          `Retiring auth session signing key ${key.id} requires retiredAt and verifyUntil.`
        );
      }
      if (
        key.retiredAt &&
        key.verifyUntil &&
        new Date(key.verifyUntil).getTime() -
          new Date(key.retiredAt).getTime() <
          (this.config.auth.token.accessTokenTtl + CLOCK_SKEW_SECONDS) * 1000
      ) {
        throw new Error(
          `Retiring auth session signing key ${key.id} must remain verifiable for the access token lifetime.`
        );
      }
    }
    return keys;
  }

  private async reconcile() {
    const stored = await this.models.appConfig.get(SIGNING_KEY_STORE_ID);
    if (!stored) {
      throw new Error('Persisted auth signing key ring is missing.');
    }
    this.applyPersisted(stored.value);
  }

  private generate(
    source: PersistedAuthSigningKey['source'],
    id = `auth-${Date.now().toString(36)}-${this.crypto.randomBytes(6).toString('base64url')}`
  ): PersistedAuthSigningKey {
    return {
      id,
      secret: this.crypto.randomBytes(32).toString('base64url'),
      status: 'active',
      createdAt: new Date().toISOString(),
      source,
    };
  }

  private keys() {
    if (!this.snapshot) {
      throw new Error('Auth signing key ring is not initialized.');
    }
    return this.snapshot;
  }
}
