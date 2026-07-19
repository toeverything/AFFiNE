import { timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { BaseModel } from './base';

export interface CreateAuthSessionInput {
  userSessionId: string;
  installationId: string;
  platform: string;
  deviceName?: string;
  appVersion?: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  refreshToken: {
    id: string;
    secretHash: string;
    expiresAt: Date;
  };
}

export interface RotateAuthRefreshTokenInput {
  id: string;
  secretHash: string;
  now: Date;
  idleExpiresAt: Date;
  graceMs: number;
  appVersion?: string;
  next: {
    id: string;
    secretHash: string;
    expiresAt: Date;
  };
}

export type RotateAuthRefreshTokenResult =
  | {
      status: 'rotated' | 'grace';
      authSessionId: string;
      userSessionId: string;
      platform: string;
    }
  | { status: 'reused'; authSessionId: string; platform: string }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'revoked' }
  | { status: 'temporarily_unavailable' };

@Injectable()
export class AuthSessionModel extends BaseModel {
  async hasUserInstallation(userSessionId: string, installationId: string) {
    const userSession = await this.db.userSession.findUnique({
      where: { id: userSessionId },
      select: { userId: true },
    });
    if (!userSession) return false;
    await this.db
      .$queryRaw`SELECT id FROM users WHERE id = ${userSession.userId} FOR UPDATE`;
    return (
      (await this.db.authSession.count({
        where: {
          installationId,
          userSession: { userId: userSession.userId },
        },
      })) > 0
    );
  }

  @Transactional()
  async create(input: CreateAuthSessionInput) {
    const session = await this.db.authSession.create({
      data: {
        userSessionId: input.userSessionId,
        installationId: input.installationId,
        platform: input.platform,
        deviceName: input.deviceName,
        appVersion: input.appVersion,
        idleExpiresAt: input.idleExpiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        refreshTokens: {
          create: {
            id: input.refreshToken.id,
            generation: 0,
            secretHash: input.refreshToken.secretHash,
            expiresAt: input.refreshToken.expiresAt,
          },
        },
      },
    });
    await this.db.userSession.update({
      where: { id: input.userSessionId },
      data: {
        expiresAt: input.idleExpiresAt,
        refreshClientVersion: input.appVersion,
      },
    });
    return session;
  }

  async get(id: string) {
    return await this.db.authSession.findUnique({
      where: { id },
      include: { userSession: true },
    });
  }

  async list(userId: string) {
    const now = new Date();
    return await this.db.authSession.findMany({
      where: {
        userSession: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        revokedAt: null,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async revokeUserSessions(userId: string, reason: string) {
    return await this.db.authSession.updateMany({
      where: {
        userSession: { userId },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: reason,
      },
    });
  }

  async revoke(id: string, reason: string, userId?: string) {
    const now = new Date();
    const where = {
      id,
      revokedAt: null,
      ...(userId ? { userSession: { userId } } : {}),
    };
    const { count } = await this.db.authSession.updateMany({
      where,
      data: { revokedAt: now, revokeReason: reason },
    });
    if (count) {
      await this.db.authRefreshToken.updateMany({
        where: { authSessionId: id, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    return count > 0;
  }

  async findByRefreshToken(id: string, secretHash: string) {
    const token = await this.db.authRefreshToken.findUnique({
      where: { id },
      select: { secretHash: true, authSessionId: true },
    });
    return token && this.secretHashesEqual(token.secretHash, secretHash)
      ? token.authSessionId
      : undefined;
  }

  @Transactional()
  async rotate(
    input: RotateAuthRefreshTokenInput
  ): Promise<RotateAuthRefreshTokenResult> {
    await this.db.$queryRaw`
      SELECT id
      FROM auth_refresh_tokens
      WHERE id = ${input.id}
      FOR UPDATE
    `;

    let token = await this.db.authRefreshToken.findUnique({
      where: { id: input.id },
      include: {
        authSession: {
          include: { userSession: { include: { user: true } } },
        },
      },
    });
    if (!token || !this.secretHashesEqual(token.secretHash, input.secretHash)) {
      return { status: 'invalid' };
    }

    const session = token.authSession;
    if (token.revokedAt || session.revokedAt) return { status: 'revoked' };
    if (session.userSession.user.disabled) {
      await this.revoke(session.id, 'user_disabled');
      return { status: 'revoked' };
    }
    if (
      token.expiresAt <= input.now ||
      session.idleExpiresAt <= input.now ||
      session.absoluteExpiresAt <= input.now ||
      (session.userSession.expiresAt &&
        session.userSession.expiresAt <= input.now)
    ) {
      return { status: 'expired' };
    }

    if (token.usedAt) {
      const replacementId = token.replacedById;
      if (
        token.graceUsedAt ||
        !replacementId ||
        input.now.getTime() - token.usedAt.getTime() > input.graceMs
      ) {
        await this.revoke(session.id, 'refresh_token_reused');
        return {
          status: 'reused',
          authSessionId: session.id,
          platform: session.platform,
        };
      }

      const claimed = await this.db.authRefreshToken.updateMany({
        where: {
          id: token.id,
          graceUsedAt: null,
          replacedById: input.next.id,
          replacedBy: { secretHash: input.next.secretHash },
        },
        data: { graceUsedAt: input.now },
      });
      if (!claimed.count) {
        return { status: 'temporarily_unavailable' };
      }
      return {
        status: 'grace',
        authSessionId: session.id,
        userSessionId: session.userSessionId,
        platform: session.platform,
      };
    }

    await this.db.authRefreshToken.create({
      data: {
        id: input.next.id,
        authSessionId: session.id,
        generation: token.generation + 1,
        secretHash: input.next.secretHash,
        expiresAt: input.next.expiresAt,
      },
    });
    await this.db.authRefreshToken.update({
      where: { id: token.id },
      data: { usedAt: input.now, replacedById: input.next.id },
    });
    await this.db.authSession.update({
      where: { id: session.id },
      data: {
        lastSeenAt: input.now,
        idleExpiresAt:
          input.idleExpiresAt < session.absoluteExpiresAt
            ? input.idleExpiresAt
            : session.absoluteExpiresAt,
        appVersion: input.appVersion,
      },
    });
    await this.db.userSession.update({
      where: { id: session.userSessionId },
      data: {
        expiresAt:
          input.idleExpiresAt < session.absoluteExpiresAt
            ? input.idleExpiresAt
            : session.absoluteExpiresAt,
        refreshClientVersion: input.appVersion,
      },
    });

    return {
      status: 'rotated',
      authSessionId: session.id,
      userSessionId: session.userSessionId,
      platform: session.platform,
    };
  }

  async deleteExpiredRefreshTokens(before: Date, limit: number) {
    const rows = await this.db.authRefreshToken.findMany({
      where: {
        OR: [
          { expiresAt: { lt: before } },
          { authSession: { revokedAt: { lt: before } } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    if (!rows.length) return 0;
    const { count } = await this.db.authRefreshToken.deleteMany({
      where: { id: { in: rows.map(row => row.id) } },
    });
    return count;
  }

  async deleteExpiredSessions(before: Date, limit: number) {
    const rows = await this.db.authSession.findMany({
      where: {
        OR: [
          { absoluteExpiresAt: { lt: before } },
          { revokedAt: { lt: before } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    if (!rows.length) return 0;
    const { count } = await this.db.authSession.deleteMany({
      where: { id: { in: rows.map(row => row.id) } },
    });
    return count;
  }

  private secretHashesEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
