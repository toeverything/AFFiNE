import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { Config } from '../../base';
import { Models, type User } from '../../models';
import { verifyEmailDomainRecords } from './email-domain';

export const AUTH_OAUTH_PROVIDER_READER = Symbol('AUTH_OAUTH_PROVIDER_READER');

interface OAuthProviderReader {
  providers: string[];
}

export interface LoginAuthMethods {
  password: { available: boolean };
  magicLink: { available: boolean };
  oauth: { available: boolean; providers: string[] };
  passkey: { available: boolean; discoverable: boolean };
}

export interface BoundAuthMethods {
  password: { bound: boolean };
  oauth: { bound: boolean; providers: string[] };
  passkey: { bound: boolean; count: number };
}

@Injectable()
export class AuthMethodsService {
  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly db: PrismaClient,
    private readonly ref: ModuleRef
  ) {}

  async loginPreflight(email: string) {
    const [user, userWithDisabled] = await Promise.all([
      this.models.user.getUserByEmail(email),
      this.models.user.getUserByEmail(email, {
        withDisabled: true,
      }),
    ]);
    const disabledUser =
      userWithDisabled?.disabled && !user ? userWithDisabled : null;
    const providers = this.oauthProviders();

    return {
      registered: !!user?.registered,
      methods: {
        password: {
          available:
            !!user?.password &&
            !user.disabled &&
            (await this.canPasswordSignIn(email)),
        },
        magicLink: {
          available: await this.canMagicLinkSignIn(email, user, disabledUser),
        },
        oauth: {
          available: providers.length > 0,
          providers,
        },
        passkey: {
          available: false,
          discoverable: false,
        },
      } satisfies LoginAuthMethods,
    };
  }

  async boundMethods(userId: string): Promise<BoundAuthMethods> {
    const [user, connectedAccounts] = await Promise.all([
      this.models.user.get(userId),
      this.db.connectedAccount.findMany({
        select: { provider: true },
        where: { userId },
      }),
    ]);
    const providers = Array.from(
      new Set(connectedAccounts.map(account => account.provider))
    );

    return {
      password: { bound: !!user?.password },
      oauth: { bound: providers.length > 0, providers },
      passkey: { bound: false, count: 0 },
    };
  }

  private async canPasswordSignIn(_email: string) {
    return true;
  }

  private async canMagicLinkSignIn(
    email: string,
    user: User | null,
    disabledUser: User | null
  ) {
    if (disabledUser) {
      return false;
    }
    if (user) {
      return !user.disabled;
    }
    if (!this.config.auth.allowSignup) {
      return false;
    }
    return this.emailDomainAllowed(email);
  }

  private async emailDomainAllowed(email: string) {
    if (!this.config.auth.requireEmailDomainVerification) {
      return true;
    }

    return verifyEmailDomainRecords(email);
  }

  private oauthProviders() {
    try {
      const reader = this.ref.get<OAuthProviderReader>(
        AUTH_OAUTH_PROVIDER_READER,
        { strict: false }
      );
      return reader.providers;
    } catch {
      return [];
    }
  }
}
