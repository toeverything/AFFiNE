import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { McpAccessMode } from '@prisma/client';

import { CryptoHelper, EventBus } from '../../../base';
import { MCP_CREDENTIAL_TOKEN_PREFIX } from '../../../core/auth/token';
import { Models } from '../../../models';

const ALLOWED_EXPIRATION_DAYS = new Set([30, 90, 365]);
const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

declare global {
  interface Events {
    'mcp.credential.created': {
      credentialId: string;
      userId: string;
      workspaceId: string;
    };
    'mcp.credential.rotated': {
      credentialId: string;
      replacedById: string;
      userId: string;
      workspaceId: string;
    };
    'mcp.credential.revoked': {
      credentialId: string;
      userId: string;
      workspaceId: string;
    };
  }
}

type IssueMcpCredential = {
  userId: string;
  workspaceId: string;
  name: string;
  accessMode: McpAccessMode;
  expirationDays: number;
};

@Injectable()
export class McpCredentialService {
  constructor(
    private readonly models: Models,
    private readonly crypto: CryptoHelper,
    private readonly event: EventBus
  ) {}

  async list(userId: string, workspaceId: string) {
    const credentials = await this.models.mcpCredential.list(
      userId,
      workspaceId
    );
    const latest = new Map<string, (typeof credentials)[number]>();
    for (const credential of credentials) {
      if (!latest.has(credential.familyId)) {
        latest.set(credential.familyId, credential);
      }
    }
    return [...latest.values()]
      .map(credential => {
        const status = this.status(credential);
        return {
          ...credential,
          graceEndsAt: status === 'ROTATING' ? credential.graceEndsAt : null,
          status,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(input: IssueMcpCredential) {
    const issued = await this.issue(input);
    this.event.emit('mcp.credential.created', {
      credentialId: issued.credential.id,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
    return issued;
  }

  @Transactional()
  async rotate(
    id: string,
    userId: string,
    workspaceId: string,
    expirationDays: number
  ) {
    const current = await this.models.mcpCredential.get(id);
    if (
      !current ||
      current.userId !== userId ||
      current.workspaceId !== workspaceId ||
      current.revokedAt ||
      current.replacedById ||
      current.expiresAt <= new Date()
    ) {
      throw new BadRequestException('MCP credential not found');
    }

    const maximumGraceEnd = new Date(Date.now() + ROTATION_GRACE_MS);
    const graceEnd =
      current.expiresAt < maximumGraceEnd ? current.expiresAt : maximumGraceEnd;
    const issued = await this.issue({
      userId,
      workspaceId,
      name: current.name,
      accessMode: current.accessMode,
      expirationDays,
      familyId: current.familyId,
      generation: current.generation + 1,
      graceEndsAt: graceEnd,
    });
    const replaced = await this.models.mcpCredential.replace(
      current.id,
      userId,
      workspaceId,
      issued.credential.id,
      graceEnd
    );
    if (replaced.count !== 1) {
      throw new BadRequestException('MCP credential not found');
    }
    this.event.emit('mcp.credential.rotated', {
      credentialId: current.id,
      replacedById: issued.credential.id,
      userId,
      workspaceId,
    });
    return issued;
  }

  async revoke(id: string, userId: string, workspaceId: string) {
    const credential = await this.models.mcpCredential.get(id);
    if (
      !credential ||
      credential.userId !== userId ||
      credential.workspaceId !== workspaceId
    ) {
      return false;
    }
    const result = await this.models.mcpCredential.revokeFamily(
      credential.familyId,
      userId,
      workspaceId
    );
    if (result.count) {
      this.event.emit('mcp.credential.revoked', {
        credentialId: id,
        userId,
        workspaceId,
      });
    }
    return result.count > 0;
  }

  async authenticate(token: string, workspaceId: string) {
    const parsed = this.parse(token);
    if (!parsed) throw new UnauthorizedException();

    const credential = await this.models.mcpCredential.authenticate(
      parsed.id,
      workspaceId
    );
    if (!credential) throw new UnauthorizedException();

    const actualHash = this.crypto.sha256(parsed.secret).toString('hex');
    if (!this.crypto.compare(actualHash, credential.secretHash)) {
      throw new UnauthorizedException();
    }

    const now = new Date();
    await this.models.mcpCredential.touch(
      credential.id,
      new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS),
      now
    );
    return credential;
  }

  private async issue(
    input: IssueMcpCredential & {
      familyId?: string;
      generation?: number;
      graceEndsAt?: Date;
    }
  ) {
    if (!ALLOWED_EXPIRATION_DAYS.has(input.expirationDays)) {
      throw new BadRequestException('Unsupported MCP credential expiration');
    }
    const name = input.name.trim();
    if (!name || name.length > 64) {
      throw new BadRequestException('MCP credential name is required');
    }

    const id = randomUUID();
    const secret = this.crypto.randomBytes(32).toString('base64url');
    const secretHash = this.crypto.sha256(secret).toString('hex');
    const credential = await this.models.mcpCredential.create({
      id,
      familyId: input.familyId ?? id,
      generation: input.generation ?? 0,
      name,
      secretHash,
      fingerprint: secretHash.slice(0, 12),
      userId: input.userId,
      workspaceId: input.workspaceId,
      accessMode: input.accessMode,
      expiresAt: new Date(
        Date.now() + input.expirationDays * 24 * 60 * 60 * 1000
      ),
      graceEndsAt: input.graceEndsAt,
    });
    return {
      credential: { ...credential, status: this.status(credential) },
      token: `${MCP_CREDENTIAL_TOKEN_PREFIX}.${id}.${secret}`,
    };
  }

  private parse(token: string) {
    const parts = token.split('.');
    if (
      parts.length !== 3 ||
      parts[0] !== MCP_CREDENTIAL_TOKEN_PREFIX ||
      !parts[1] ||
      !parts[2]
    ) {
      return null;
    }
    return { id: parts[1], secret: parts[2] };
  }

  private status(credential: {
    revokedAt: Date | null;
    expiresAt: Date;
    graceEndsAt: Date | null;
  }) {
    const now = Date.now();
    if (credential.revokedAt) return 'REVOKED' as const;
    if (credential.expiresAt.getTime() <= now) return 'EXPIRED' as const;
    if (credential.graceEndsAt && credential.graceEndsAt.getTime() > now) {
      return 'ROTATING' as const;
    }
    if (credential.expiresAt.getTime() - now <= 7 * 24 * 60 * 60 * 1000) {
      return 'EXPIRING' as const;
    }
    return 'ACTIVE' as const;
  }
}
