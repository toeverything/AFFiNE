import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  Array as YArray,
  diffUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVectorFromUpdate,
  Map as YMap,
  mergeUpdates,
} from 'yjs';

import { AccessDenied, DocActionDenied, DocNotFound } from '../../base';
import { DocRole } from '../../models';
import { PgWorkspaceDocStorageAdapter } from '../doc/adapters/workspace';

export interface AnonymousDocAccessLink {
  id: string;
  workspaceId: string;
  docId: string;
  role: DocRole;
  enabled: boolean;
  revokedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatedAnonymousDocAccessLink extends AnonymousDocAccessLink {
  token: string;
}

export interface AnonymousDocGuestSession {
  id: string;
  linkId: string;
  workspaceId: string;
  docId: string;
  guestId: string;
  displayName: string;
  color: string;
  revertedAt: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface ResolvedAnonymousDocAccess {
  link: AnonymousDocAccessLink;
  guest: AnonymousDocGuestSession;
  guestToken: string;
}

export interface AnonymousDocUpdateRecord {
  id: string;
  linkId: string;
  guestSessionId: string;
  workspaceId: string;
  docId: string;
  timestamp: Date;
  createdAt: Date;
}

export interface AnonymousDocGuestPrincipal {
  linkId: string;
  guestSessionId: string;
  guestId: string;
  workspaceId: string;
  docId: string;
  role: DocRole;
}

const GUEST_COLORS = [
  '#E15A3A',
  '#D79600',
  '#36A269',
  '#2E7BCF',
  '#7D5AC8',
  '#C45189',
];

@Injectable()
export class AnonymousDocAccessService {
  constructor(
    private readonly db: PrismaClient,
    private readonly workspace: PgWorkspaceDocStorageAdapter
  ) {}

  private createToken() {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private mapLink(row: AnonymousDocAccessLink): AnonymousDocAccessLink {
    return {
      ...row,
      role: row.role as DocRole,
    };
  }

  async createLink(
    workspaceId: string,
    docId: string,
    createdByUserId: string
  ): Promise<CreatedAnonymousDocAccessLink> {
    this.assertShareableDocId(workspaceId, docId);
    const doc = await this.db.snapshot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: docId,
        },
      },
      select: {
        id: true,
      },
    });
    if (!doc) {
      throw new DocNotFound({ spaceId: workspaceId, docId });
    }

    const token = this.createToken();
    const tokenHash = this.hashToken(token);
    const rows = await this.db.$queryRaw<AnonymousDocAccessLink[]>`
      INSERT INTO "anonymous_doc_access_links" (
        "id",
        "workspace_id",
        "doc_id",
        "token_hash",
        "role",
        "created_by_user_id",
        "updated_at"
      )
      VALUES (
        ${randomUUID()},
        ${workspaceId},
        ${docId},
        ${tokenHash},
        ${DocRole.Editor},
        ${createdByUserId},
        CURRENT_TIMESTAMP
      )
      RETURNING
        "id",
        "workspace_id" AS "workspaceId",
        "doc_id" AS "docId",
        "role",
        "enabled",
        "revoked_at" AS "revokedAt",
        "created_by_user_id" AS "createdByUserId",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `;

    return {
      ...this.mapLink(rows[0]),
      token,
    };
  }

  async revokeLink(
    workspaceId: string,
    docId: string,
    linkId: string
  ): Promise<AnonymousDocAccessLink | null> {
    const rows = await this.db.$queryRaw<AnonymousDocAccessLink[]>`
      UPDATE "anonymous_doc_access_links"
      SET
        "enabled" = false,
        "revoked_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${linkId}
        AND "workspace_id" = ${workspaceId}
        AND "doc_id" = ${docId}
      RETURNING
        "id",
        "workspace_id" AS "workspaceId",
        "doc_id" AS "docId",
        "role",
        "enabled",
        "revoked_at" AS "revokedAt",
        "created_by_user_id" AS "createdByUserId",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `;

    return rows[0] ? this.mapLink(rows[0]) : null;
  }

  async listLinks(workspaceId: string, docId: string) {
    const rows = await this.db.$queryRaw<AnonymousDocAccessLink[]>`
      SELECT
        "id",
        "workspace_id" AS "workspaceId",
        "doc_id" AS "docId",
        "role",
        "enabled",
        "revoked_at" AS "revokedAt",
        "created_by_user_id" AS "createdByUserId",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "anonymous_doc_access_links"
      WHERE "workspace_id" = ${workspaceId} AND "doc_id" = ${docId}
      ORDER BY "created_at" DESC
    `;

    return rows.map(row => this.mapLink(row));
  }

  async resolveLink(
    token: string,
    displayName?: string | null
  ): Promise<ResolvedAnonymousDocAccess> {
    const tokenHash = this.hashToken(token);
    const rows = await this.db.$queryRaw<AnonymousDocAccessLink[]>`
      SELECT
        "id",
        "workspace_id" AS "workspaceId",
        "doc_id" AS "docId",
        "role",
        "enabled",
        "revoked_at" AS "revokedAt",
        "created_by_user_id" AS "createdByUserId",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "anonymous_doc_access_links"
      WHERE "token_hash" = ${tokenHash}
      LIMIT 1
    `;
    const link = rows[0] ? this.mapLink(rows[0]) : null;
    if (!link || !link.enabled || link.revokedAt) {
      throw new AccessDenied('Anonymous doc link is not active');
    }
    await this.assertDocExists(link.workspaceId, link.docId);

    const guestToken = this.createToken();
    const guestTokenHash = this.hashToken(guestToken);
    const guestId = randomUUID();
    const safeDisplayName = (displayName?.trim() || 'Anonymous guest').slice(
      0,
      80
    );
    const color =
      GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)] ??
      GUEST_COLORS[0];

    const guestRows = await this.db.$queryRaw<AnonymousDocGuestSession[]>`
      INSERT INTO "anonymous_doc_guest_sessions" (
        "id",
        "link_id",
        "workspace_id",
        "doc_id",
        "guest_id",
        "token_hash",
        "display_name",
        "color"
      )
      VALUES (
        ${randomUUID()},
        ${link.id},
        ${link.workspaceId},
        ${link.docId},
        ${guestId},
        ${guestTokenHash},
        ${safeDisplayName},
        ${color}
      )
      RETURNING
        "id",
        "link_id" AS "linkId",
        "workspace_id" AS "workspaceId",
        "doc_id" AS "docId",
        "guest_id" AS "guestId",
        "display_name" AS "displayName",
        "color",
        "reverted_at" AS "revertedAt",
        "last_seen_at" AS "lastSeenAt",
        "created_at" AS "createdAt"
    `;

    return {
      link,
      guest: guestRows[0],
      guestToken,
    };
  }

  async getGuestPrincipal(
    guestToken: string
  ): Promise<AnonymousDocGuestPrincipal> {
    const tokenHash = this.hashToken(guestToken);
    const rows = await this.db.$queryRaw<
      Array<{
        linkId: string;
        guestSessionId: string;
        guestId: string;
        workspaceId: string;
        docId: string;
        role: number;
        linkEnabled: boolean;
        revokedAt: Date | null;
      }>
    >`
      SELECT
        "session"."link_id" AS "linkId",
        "session"."id" AS "guestSessionId",
        "session"."guest_id" AS "guestId",
        "session"."workspace_id" AS "workspaceId",
        "session"."doc_id" AS "docId",
        "link"."role" AS "role",
        "link"."enabled" AS "linkEnabled",
        "link"."revoked_at" AS "revokedAt"
      FROM "anonymous_doc_guest_sessions" AS "session"
      INNER JOIN "anonymous_doc_access_links" AS "link"
        ON "link"."id" = "session"."link_id"
      WHERE "session"."token_hash" = ${tokenHash}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row || !row.linkEnabled || row.revokedAt) {
      throw new AccessDenied('Anonymous guest session is not active');
    }

    await this.db.$executeRaw`
      UPDATE "anonymous_doc_guest_sessions"
      SET "last_seen_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.guestSessionId}
    `;

    return {
      linkId: row.linkId,
      guestSessionId: row.guestSessionId,
      guestId: row.guestId,
      workspaceId: row.workspaceId,
      docId: row.docId,
      role: row.role as DocRole,
    };
  }

  assertCanAccessDoc(
    principal: AnonymousDocGuestPrincipal,
    workspaceId: string,
    docId: string
  ) {
    if (
      principal.workspaceId !== workspaceId ||
      (principal.docId !== docId && docId !== workspaceId)
    ) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId,
        action: 'Doc.Read',
      });
    }
  }

  async getDocDiff(
    principal: AnonymousDocGuestPrincipal,
    workspaceId: string,
    docId: string,
    stateVector?: Uint8Array
  ) {
    if (principal.workspaceId !== workspaceId) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId,
        action: 'Doc.Read',
      });
    }

    if (docId === workspaceId) {
      return this.createProjectedRootDocDiff(principal, stateVector);
    }

    if (this.isSystemDoc(docId)) {
      return this.createEmptyDocDiff(docId, stateVector);
    }

    this.assertCanAccessDoc(principal, workspaceId, docId);
    const doc = await this.workspace.getDocDiff(
      workspaceId,
      docId,
      stateVector
    );
    if (!doc) {
      throw new DocNotFound({ spaceId: workspaceId, docId });
    }

    return doc;
  }

  assertCanUpdateDoc(
    principal: AnonymousDocGuestPrincipal,
    workspaceId: string,
    docId: string
  ) {
    this.assertCanAccessDoc(principal, workspaceId, docId);
    if (docId === workspaceId) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId,
        action: 'Doc.Update',
      });
    }
    if (principal.role < DocRole.Editor) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId,
        action: 'Doc.Update',
      });
    }
  }

  async assertCanWriteDoc(
    principal: AnonymousDocGuestPrincipal,
    workspaceId: string,
    docId: string
  ) {
    this.assertCanUpdateDoc(principal, workspaceId, docId);
    await this.assertDocExists(workspaceId, docId);
  }

  async assertCanWriteBlob(
    principal: AnonymousDocGuestPrincipal,
    workspaceId: string,
    key: string
  ) {
    this.assertCanUpdateDoc(principal, workspaceId, principal.docId);
    await this.assertDocExists(workspaceId, principal.docId);
    if (!key.startsWith(this.anonymousBlobPrefix(principal.docId))) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId: principal.docId,
        action: 'Doc.Update',
      });
    }
  }

  async recordUpdates(
    principal: AnonymousDocGuestPrincipal,
    updates: Buffer[],
    timestamp: number
  ) {
    await this.assertDocExists(principal.workspaceId, principal.docId);

    const createdAt = new Date(timestamp);
    for (const update of updates) {
      await this.db.$executeRaw`
        INSERT INTO "anonymous_doc_updates" (
          "id",
          "link_id",
          "guest_session_id",
          "workspace_id",
          "doc_id",
          "update",
          "timestamp"
        )
        VALUES (
          ${randomUUID()},
          ${principal.linkId},
          ${principal.guestSessionId},
          ${principal.workspaceId},
          ${principal.docId},
          ${update},
          ${createdAt}
        )
      `;
    }
  }

  async listGuestUpdates(
    workspaceId: string,
    docId: string,
    guestSessionId: string
  ) {
    return await this.db.$queryRaw<AnonymousDocUpdateRecord[]>`
      SELECT
        "id",
        "link_id" AS "linkId",
        "guest_session_id" AS "guestSessionId",
        "workspace_id" AS "workspaceId",
        "doc_id" AS "docId",
        "timestamp",
        "created_at" AS "createdAt"
      FROM "anonymous_doc_updates"
      WHERE "guest_session_id" = ${guestSessionId}
        AND "workspace_id" = ${workspaceId}
        AND "doc_id" = ${docId}
      ORDER BY "timestamp" ASC
    `;
  }

  async revertGuestSession(
    workspaceId: string,
    docId: string,
    guestSessionId: string,
    _editorId: string
  ) {
    const rows = await this.db.$queryRaw<
      Array<{
        workspaceId: string;
        docId: string;
        createdAt: Date;
        revertedAt: Date | null;
      }>
    >`
      SELECT
        "workspace_id" AS "workspaceId",
        "doc_id" AS "docId",
        "created_at" AS "createdAt",
        "reverted_at" AS "revertedAt"
      FROM "anonymous_doc_guest_sessions"
      WHERE "id" = ${guestSessionId}
        AND "workspace_id" = ${workspaceId}
        AND "doc_id" = ${docId}
      LIMIT 1
    `;
    const session = rows[0];
    if (!session) {
      throw new AccessDenied('Anonymous guest session does not exist');
    }
    if (session.revertedAt) {
      return session.revertedAt;
    }

    throw new AccessDenied(
      'Anonymous guest revert requires per-guest inverse updates'
    );
  }

  private assertShareableDocId(workspaceId: string, docId: string) {
    if (workspaceId === docId || this.isSystemDoc(docId)) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId,
        action: 'Doc.Users.Manage',
      });
    }
  }

  private async assertDocExists(workspaceId: string, docId: string) {
    const snapshot = await this.db.snapshot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: docId,
        },
      },
      select: {
        id: true,
      },
    });
    if (!snapshot) {
      throw new DocNotFound({ spaceId: workspaceId, docId });
    }
  }

  async getRecordedGuestUpdate(
    workspaceId: string,
    docId: string,
    guestSessionId: string
  ) {
    const rows = await this.db.$queryRaw<Array<{ update: Buffer }>>`
      SELECT "update"
      FROM "anonymous_doc_updates"
      WHERE "workspace_id" = ${workspaceId}
        AND "doc_id" = ${docId}
        AND "guest_session_id" = ${guestSessionId}
      ORDER BY "timestamp" ASC
    `;

    return rows.length ? mergeUpdates(rows.map(row => row.update)) : null;
  }

  async assertCanReadBlob(
    principal: AnonymousDocGuestPrincipal,
    workspaceId: string,
    key: string
  ) {
    if (principal.workspaceId !== workspaceId) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId: principal.docId,
        action: 'Doc.Read',
      });
    }

    const anonymousBlobPrefix = 'anonymous-doc/';
    if (
      key.startsWith(anonymousBlobPrefix) &&
      !key.startsWith(this.anonymousBlobPrefix(principal.docId))
    ) {
      throw new DocActionDenied({
        spaceId: workspaceId,
        docId: principal.docId,
        action: 'Doc.Read',
      });
    }

    await this.assertDocExists(workspaceId, principal.docId);
  }

  anonymousBlobPrefix(docId: string) {
    return `anonymous-doc/${docId}/`;
  }

  isReadOnlySyntheticDoc(workspaceId: string, docId: string) {
    return docId === workspaceId || this.isSystemDoc(docId);
  }

  private isSystemDoc(docId: string) {
    return docId.startsWith('db$') || docId.startsWith('userdata$');
  }

  private createEmptyDocDiff(docId: string, stateVector?: Uint8Array) {
    const doc = new Doc({ guid: docId });
    const update = encodeStateAsUpdate(doc);

    return {
      missing: stateVector ? diffUpdate(update, stateVector) : update,
      state: encodeStateVectorFromUpdate(update),
      timestamp: Date.now(),
    };
  }

  private createProjectedRootDocDiff(
    principal: AnonymousDocGuestPrincipal,
    stateVector?: Uint8Array
  ) {
    const rootDoc = new Doc({ guid: principal.workspaceId });
    const pages = new YArray();
    const page = new YMap();
    page.set('id', principal.docId);
    page.set('title', '');
    page.set('createDate', Date.now());
    page.set('tags', []);
    pages.push([page]);
    rootDoc.getMap('meta').set('pages', pages);
    rootDoc.getMap('meta').set('name', 'Anonymous board');

    const update = encodeStateAsUpdate(rootDoc);

    return {
      missing: stateVector ? diffUpdate(update, stateVector) : update,
      state: encodeStateVectorFromUpdate(update),
      timestamp: Date.now(),
    };
  }
}
