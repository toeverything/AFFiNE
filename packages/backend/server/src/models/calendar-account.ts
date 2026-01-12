import { Injectable } from '@nestjs/common';
import type { CalendarAccount, Prisma } from '@prisma/client';

import { CryptoHelper } from '../base';
import { BaseModel } from './base';

export interface CalendarAccountTokens {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
}

export interface UpsertCalendarAccountInput extends CalendarAccountTokens {
  userId: string;
  provider: string;
  providerAccountId: string;
  displayName?: string | null;
  email?: string | null;
  status?: string | null;
  lastError?: string | null;
  refreshIntervalMinutes?: number | null;
}

export interface UpdateCalendarAccountTokensInput extends CalendarAccountTokens {
  status?: string | null;
  lastError?: string | null;
}

@Injectable()
export class CalendarAccountModel extends BaseModel {
  constructor(private readonly crypto: CryptoHelper) {
    super();
  }

  private encryptToken(token?: string | null) {
    return token ? this.crypto.encrypt(token) : null;
  }

  private decryptToken(token?: string | null) {
    return token ? this.crypto.decrypt(token) : null;
  }

  async listByUser(userId: string) {
    return await this.db.calendarAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    return await this.db.calendarAccount.findUnique({
      where: { id },
    });
  }

  async getByProviderAccount(
    userId: string,
    provider: string,
    providerAccountId: string
  ) {
    return await this.db.calendarAccount.findFirst({
      where: { userId, provider, providerAccountId },
    });
  }

  async upsert(input: UpsertCalendarAccountInput) {
    const accessToken = this.encryptToken(input.accessToken);
    const refreshToken = this.encryptToken(input.refreshToken);
    const data: Prisma.CalendarAccountUncheckedCreateInput = {
      userId: input.userId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      displayName: input.displayName ?? null,
      email: input.email ?? null,
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
      expiresAt: input.expiresAt ?? null,
      scope: input.scope ?? null,
      status: input.status ?? 'active',
      lastError: input.lastError ?? null,
      refreshIntervalMinutes: input.refreshIntervalMinutes ?? 60,
    };

    const updateData: Prisma.CalendarAccountUncheckedUpdateInput = {
      displayName: data.displayName,
      email: data.email,
      expiresAt: data.expiresAt,
      scope: data.scope,
      status: data.status,
      lastError: data.lastError,
      refreshIntervalMinutes: data.refreshIntervalMinutes,
    };

    if (!!accessToken) {
      updateData.accessToken = accessToken;
    }
    if (!!refreshToken) {
      updateData.refreshToken = refreshToken;
    }

    return await this.db.calendarAccount.upsert({
      where: {
        userId_provider_providerAccountId: {
          userId: input.userId,
          provider: input.provider,
          providerAccountId: input.providerAccountId,
        },
      },
      create: data,
      update: updateData,
    });
  }

  async updateTokens(id: string, input: UpdateCalendarAccountTokensInput) {
    const data: Prisma.CalendarAccountUncheckedUpdateInput = {};
    if (input.accessToken !== undefined) {
      data.accessToken = this.encryptToken(input.accessToken);
    }
    if (input.refreshToken !== undefined) {
      data.refreshToken = this.encryptToken(input.refreshToken);
    }
    if (input.expiresAt !== undefined) {
      data.expiresAt = input.expiresAt ?? null;
    }
    if (input.scope !== undefined) {
      data.scope = input.scope ?? null;
    }
    if (input.status !== undefined) {
      data.status = input.status ?? undefined;
    }
    if (input.lastError !== undefined) {
      data.lastError = input.lastError ?? null;
    }

    return await this.db.calendarAccount.update({
      where: { id },
      data,
    });
  }

  async updateStatus(id: string, status: string, lastError?: string | null) {
    return await this.db.calendarAccount.update({
      where: { id },
      data: {
        status,
        lastError: lastError ?? null,
      },
    });
  }

  async updateRefreshInterval(id: string, refreshIntervalMinutes: number) {
    return await this.db.calendarAccount.update({
      where: { id },
      data: { refreshIntervalMinutes },
    });
  }

  async delete(id: string) {
    return await this.db.calendarAccount.delete({
      where: { id },
    });
  }

  decryptTokens(account: CalendarAccount) {
    return {
      ...account,
      accessToken: this.decryptToken(account.accessToken),
      refreshToken: this.decryptToken(account.refreshToken),
    };
  }
}
