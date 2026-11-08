import { Injectable } from '@nestjs/common';

import {
  ActionForbidden,
  EventBus,
  InvalidAppConfigInput,
  OnEvent,
} from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';

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
    'auth.signing_key.rotated': {
      actorId: string;
      previousKeyId: string;
      activeKeyId: string;
    };
    'auth.signing_key.deleted': { actorId: string; keyId: string };
  }
}

type EncodedMetadata = Omit<
  AuthSigningKeyMetadata,
  'createdAt' | 'retiredAt' | 'verifyUntil'
> & {
  createdAt?: string;
  retiredAt?: string;
  verifyUntil?: string;
};

@Injectable()
export class AuthSigningKeyRing {
  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly event: EventBus
  ) {}

  @OnEvent('config.init', { prepend: true })
  async onConfigInit() {
    await this.rt.executeAuthSessionCommandV1({ action: 'initialize_keyring' });
  }

  async metadata() {
    return this.command({ action: 'signing_key_metadata' });
  }

  async rotate(actorId: string, expectedActiveKeyId: string) {
    const before = await this.metadata();
    let keys: AuthSigningKeyMetadata[];
    try {
      keys = await this.command({
        action: 'rotate_signing_key',
        actorId,
        expectedActiveKeyId,
      });
    } catch (error) {
      if (String(error).includes('auth signing key changed')) {
        throw new InvalidAppConfigInput({
          message: 'The active signing key changed. Reload and try again.',
        });
      }
      throw error;
    }
    const active = keys.find(key => key.status === 'active');
    if (active) {
      this.event.emit('auth.signing_key.rotated', {
        actorId,
        previousKeyId:
          before.find(key => key.status === 'active')?.id ??
          expectedActiveKeyId,
        activeKeyId: active.id,
      });
    }
    return keys;
  }

  async delete(actorId: string, keyId: string) {
    let keys: AuthSigningKeyMetadata[];
    try {
      keys = await this.command({
        action: 'delete_signing_key',
        actorId,
        keyId,
      });
    } catch (error) {
      const message = String(error);
      if (message.includes('does not exist')) {
        throw new InvalidAppConfigInput({
          message: 'Signing key does not exist.',
        });
      }
      if (message.includes('cannot be deleted')) throw new ActionForbidden();
      throw error;
    }
    this.event.emit('auth.signing_key.deleted', { actorId, keyId });
    return keys;
  }

  private async command(input: Record<string, unknown>) {
    const keys =
      await this.rt.executeAuthSessionCommandV1<EncodedMetadata[]>(input);
    return keys.map(key => ({
      ...key,
      createdAt: key.createdAt ? new Date(key.createdAt) : undefined,
      retiredAt: key.retiredAt ? new Date(key.retiredAt) : undefined,
      verifyUntil: key.verifyUntil ? new Date(key.verifyUntil) : undefined,
    }));
  }
}
