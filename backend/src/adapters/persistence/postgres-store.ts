import postgres from 'postgres';

import { errors } from '../../domain/errors.js';
import type {
  BlobUploadMethod,
  BlobUploadPart,
  BlobUploadSession,
  DocHistoryRecord,
  StoredBlob,
} from '../../domain/blob.js';
import type {
  CommentChangeRecord,
  CommentRecord,
  CommentReplyRecord,
  Pagination,
} from '../../domain/comment.js';
import { decodeCursor, paginationLimit } from '../../domain/comment.js';
import type {
  DocumentRecord,
  DocLifecycle,
  SpaceType,
  StoredDocUpdate,
} from '../../domain/doc.js';
import type {
  Credential,
  DevicePlatform,
  Session,
  User,
  UserFeature,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '../../domain/identity.js';
import type {
  InvitationStatus,
  WorkspaceInvitation,
  WorkspaceInviteLink,
  WorkspacePatch,
} from '../../domain/membership.js';
import type { AuditEvent, AuditQuery } from '../../domain/audit.js';
import type {
  CopilotMessageRecord,
  CopilotSessionRecord,
} from '../../domain/ai.js';
import type { OauthAccount } from '../../domain/sso.js';
import type { SecurityPolicy } from '../../domain/security.js';
import type { WorkspaceWebhook } from '../../domain/webhook.js';
import type { MosaicStore } from '../../domain/ports.js';
import type { PublicDoc, PublicDocMode } from '../../domain/share.js';
import { applyMigrations } from './migrate.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  email_verified: boolean;
  avatar_url: string | null;
  features: string[];
  created_at: Date;
  updated_at: Date;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string | null;
  csrf_token: string;
  refresh_token_hash: string | null;
  refresh_expires_at: Date | null;
  access_token_hash: string | null;
  access_expires_at: Date | null;
  exchange_code_hash: string | null;
  exchange_expires_at: Date | null;
  installation_id: string | null;
  platform: string | null;
  device_name: string | null;
  app_version: string | null;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  last_seen_at: Date;
}

interface WorkspaceRow {
  id: string;
  name: string;
  is_public: boolean;
  initialized: boolean;
  team: boolean;
  enable_sharing: boolean;
  enable_url_preview: boolean;
  enable_ai: boolean;
  created_at: Date;
  created_by: string | null;
}

interface DocumentRow {
  space_type: SpaceType;
  space_id: string;
  doc_id: string;
  snapshot: Uint8Array | Buffer | null;
  timestamp: string | number | bigint;
  lifecycle: DocLifecycle;
  update_count: number;
}

interface UpdateRow {
  clock: string | number | bigint;
  payload: Uint8Array | Buffer;
  payload_hash: string;
}

interface BlobRow {
  workspace_id: string;
  key: string;
  mime: string;
  size: number;
  payload_hash: string;
  created_by: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

interface UploadRow {
  id: string;
  token: string;
  workspace_id: string;
  key: string;
  mime: string;
  size: number;
  method: BlobUploadMethod;
  part_size: number | null;
  expires_at: Date;
  created_by: string;
  created_at: Date;
}

interface PartRow {
  upload_id: string;
  part_number: number;
  etag: string | null;
  token: string;
  size: number;
}

function toBytes(value: Uint8Array | Buffer | null | undefined): Uint8Array {
  if (!value) {
    return new Uint8Array();
  }
  return value instanceof Uint8Array
    ? Uint8Array.from(value)
    : new Uint8Array(value);
}

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    spaceType: row.space_type,
    spaceId: row.space_id,
    docId: row.doc_id,
    snapshot: row.snapshot ? toBytes(row.snapshot) : null,
    timestamp: Number(row.timestamp),
    lifecycle: row.lifecycle,
    updateCount: Number(row.update_count),
  };
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.email_verified,
    avatarUrl: row.avatar_url,
    features: row.features as UserFeature[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    csrfToken: row.csrf_token,
    refreshTokenHash: row.refresh_token_hash,
    refreshExpiresAt: row.refresh_expires_at,
    accessTokenHash: row.access_token_hash,
    accessExpiresAt: row.access_expires_at,
    exchangeCodeHash: row.exchange_code_hash,
    exchangeExpiresAt: row.exchange_expires_at,
    installationId: row.installation_id,
    platform: (row.platform as DevicePlatform | null) ?? null,
    deviceName: row.device_name,
    appVersion: row.app_version,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    isPublic: row.is_public,
    initialized: row.initialized,
    team: row.team,
    enableSharing: row.enable_sharing,
    enableUrlPreview: row.enable_url_preview,
    enableAi: row.enable_ai,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function mapBlob(row: BlobRow): StoredBlob {
  return {
    workspaceId: row.workspace_id,
    key: row.key,
    mime: row.mime,
    size: Number(row.size),
    payloadHash: row.payload_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function mapUpload(row: UploadRow): BlobUploadSession {
  return {
    id: row.id,
    token: row.token,
    workspaceId: row.workspace_id,
    key: row.key,
    mime: row.mime,
    size: Number(row.size),
    method: row.method,
    partSize: row.part_size,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapPart(row: PartRow): BlobUploadPart {
  return {
    uploadId: row.upload_id,
    partNumber: Number(row.part_number),
    etag: row.etag,
    token: row.token,
    size: Number(row.size),
  };
}

interface MemberRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invite_id: string;
  created_at: Date;
}

function mapMember(row: MemberRow): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    inviteId: row.invite_id,
    createdAt: row.created_at,
  };
}

interface InvitationRow {
  id: string;
  workspace_id: string;
  email: string;
  invitee_id: string | null;
  inviter_id: string;
  role: 'admin' | 'collaborator';
  status: InvitationStatus;
  created_at: Date;
  accepted_at: Date | null;
}

function mapInvitation(row: InvitationRow): WorkspaceInvitation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    inviteeId: row.invitee_id,
    inviterId: row.inviter_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  };
}

interface InviteLinkRow {
  workspace_id: string;
  token: string;
  expire_at: Date;
  created_by: string;
  created_at: Date;
}

function mapInviteLink(row: InviteLinkRow): WorkspaceInviteLink {
  return {
    workspaceId: row.workspace_id,
    token: row.token,
    expireAt: row.expire_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

interface PublicDocRow {
  workspace_id: string;
  doc_id: string;
  mode: PublicDocMode;
  published_at: Date;
  published_by: string | null;
}

function mapPublicDoc(row: PublicDocRow): PublicDoc {
  return {
    workspaceId: row.workspace_id,
    docId: row.doc_id,
    mode: row.mode,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

interface CommentRow {
  id: string;
  workspace_id: string;
  doc_id: string;
  user_id: string;
  content: unknown;
  resolved: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapComment(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    docId: row.doc_id,
    userId: row.user_id,
    content: row.content,
    resolved: row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ReplyRow {
  id: string;
  comment_id: string;
  user_id: string;
  content: unknown;
  created_at: Date;
  updated_at: Date;
}

function mapReply(row: ReplyRow): CommentReplyRecord {
  return {
    id: row.id,
    commentId: row.comment_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ChangeRow {
  id: string;
  workspace_id: string;
  doc_id: string;
  action: 'update' | 'delete';
  item: unknown;
  comment_id: string | null;
  entity_id: string;
  created_at: Date;
}

function mapChange(row: ChangeRow): CommentChangeRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    docId: row.doc_id,
    action: row.action,
    item: row.item,
    commentId: row.comment_id,
    entityId: row.entity_id,
    createdAt: row.created_at,
  };
}

function asJson(value: unknown): postgres.JSONValue {
  const serialized = JSON.parse(
    JSON.stringify(value ?? null)
  ) as postgres.JSONValue;
  if (serialized !== null && typeof serialized === 'object') {
    return serialized;
  }
  return { value: serialized };
}

function paginate<T extends { createdAt: Date; id: string }>(
  all: T[],
  pagination?: Pagination
): { items: T[]; totalCount: number; hasNextPage: boolean } {
  let start = pagination?.offset ?? 0;
  if (pagination?.after) {
    const cursor = decodeCursor(pagination.after);
    if (cursor) {
      const index = all.findIndex(
        item =>
          item.createdAt.getTime() > cursor.at.getTime() ||
          (item.createdAt.getTime() === cursor.at.getTime() &&
            item.id > cursor.id)
      );
      start = index >= 0 ? index : all.length;
    }
  }
  const limit = paginationLimit(pagination, all.length || 10);
  const items = all.slice(start, start + limit);
  return {
    items,
    totalCount: all.length,
    hasNextPage: start + items.length < all.length,
  };
}

export class PostgresStore implements MosaicStore {
  readonly kind = 'postgres' as const;

  constructor(private readonly sql: postgres.Sql) {}

  static async connect(databaseUrl: string): Promise<PostgresStore> {
    const sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    const store = new PostgresStore(sql);
    await applyMigrations(sql);
    return store;
  }

  async ping(): Promise<boolean> {
    await this.sql`SELECT 1`;
    return true;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async countUsers(): Promise<number> {
    const [row] = await this.sql<
      { count: string }[]
    >`SELECT count(*)::text AS count FROM users`;
    return Number(row?.count ?? 0);
  }

  async findUserById(id: string): Promise<User | null> {
    const [row] = await this.sql<
      UserRow[]
    >`SELECT * FROM users WHERE id = ${id}`;
    return row ? mapUser(row) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.sql<
      UserRow[]
    >`SELECT * FROM users WHERE email = ${email}`;
    return row ? mapUser(row) : null;
  }

  async createUser(user: User, passwordHash: string | null): Promise<User> {
    try {
      await this.sql.begin(async tx => {
        await tx`
          INSERT INTO users (id, email, name, email_verified, avatar_url, features, created_at, updated_at)
          VALUES (
            ${user.id}, ${user.email}, ${user.name}, ${user.emailVerified},
            ${user.avatarUrl}, ${user.features}, ${user.createdAt}, ${user.updatedAt}
          )
        `;
        if (passwordHash) {
          await tx`
            INSERT INTO credentials (user_id, password_hash, updated_at)
            VALUES (${user.id}, ${passwordHash}, ${user.updatedAt})
          `;
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw errors.emailAlreadyUsed();
      }
      throw error;
    }
    return user;
  }

  async updateUser(
    id: string,
    patch: Partial<
      Pick<User, 'name' | 'avatarUrl' | 'emailVerified' | 'features'>
    >
  ): Promise<User> {
    const current = await this.findUserById(id);
    if (!current) {
      throw new Error('user not found');
    }
    const next: User = {
      ...current,
      ...patch,
      updatedAt: new Date(),
    };
    await this.sql`
      UPDATE users SET
        name = ${next.name},
        avatar_url = ${next.avatarUrl},
        email_verified = ${next.emailVerified},
        features = ${next.features},
        updated_at = ${next.updatedAt}
      WHERE id = ${id}
    `;
    return next;
  }

  async getCredential(userId: string): Promise<Credential | null> {
    const [row] = await this.sql<
      { user_id: string; password_hash: string; updated_at: Date }[]
    >`
      SELECT user_id, password_hash, updated_at FROM credentials WHERE user_id = ${userId}
    `;
    return row
      ? {
          userId: row.user_id,
          passwordHash: row.password_hash,
          updatedAt: row.updated_at,
        }
      : null;
  }

  async createSession(session: Session): Promise<Session> {
    await this.sql`
      INSERT INTO sessions (
        id, user_id, token_hash, csrf_token, refresh_token_hash, refresh_expires_at,
        access_token_hash, access_expires_at, exchange_code_hash, exchange_expires_at,
        installation_id, platform, device_name, app_version, idle_expires_at,
        absolute_expires_at, revoked_at, created_at, last_seen_at
      ) VALUES (
        ${session.id}, ${session.userId}, ${session.tokenHash}, ${session.csrfToken},
        ${session.refreshTokenHash}, ${session.refreshExpiresAt}, ${session.accessTokenHash},
        ${session.accessExpiresAt}, ${session.exchangeCodeHash}, ${session.exchangeExpiresAt},
        ${session.installationId}, ${session.platform}, ${session.deviceName},
        ${session.appVersion}, ${session.idleExpiresAt}, ${session.absoluteExpiresAt},
        ${session.revokedAt}, ${session.createdAt}, ${session.lastSeenAt}
      )
    `;
    return session;
  }

  async findSessionById(id: string): Promise<Session | null> {
    const [row] = await this.sql<
      SessionRow[]
    >`SELECT * FROM sessions WHERE id = ${id}`;
    return row ? mapSession(row) : null;
  }

  async findSessionByTokenHash(hash: string): Promise<Session | null> {
    const [row] = await this.sql<
      SessionRow[]
    >`SELECT * FROM sessions WHERE token_hash = ${hash}`;
    return row ? mapSession(row) : null;
  }

  async findSessionByAccessHash(hash: string): Promise<Session | null> {
    const [row] = await this.sql<SessionRow[]>`
      SELECT * FROM sessions WHERE access_token_hash = ${hash}
    `;
    return row ? mapSession(row) : null;
  }

  async findSessionByRefreshHash(hash: string): Promise<Session | null> {
    const [row] = await this.sql<SessionRow[]>`
      SELECT * FROM sessions WHERE refresh_token_hash = ${hash}
    `;
    return row ? mapSession(row) : null;
  }

  async findSessionByExchangeHash(hash: string): Promise<Session | null> {
    const [row] = await this.sql<SessionRow[]>`
      SELECT * FROM sessions WHERE exchange_code_hash = ${hash}
    `;
    return row ? mapSession(row) : null;
  }

  async listSessionsByUser(userId: string): Promise<Session[]> {
    const rows = await this.sql<SessionRow[]>`
      SELECT * FROM sessions WHERE user_id = ${userId} ORDER BY created_at DESC
    `;
    return rows.map(mapSession);
  }

  async updateSession(id: string, patch: Partial<Session>): Promise<Session> {
    const current = await this.findSessionById(id);
    if (!current) {
      throw new Error('session not found');
    }
    const next: Session = { ...current, ...patch, id: current.id };
    await this.sql`
      UPDATE sessions SET
        token_hash = ${next.tokenHash},
        csrf_token = ${next.csrfToken},
        refresh_token_hash = ${next.refreshTokenHash},
        refresh_expires_at = ${next.refreshExpiresAt},
        access_token_hash = ${next.accessTokenHash},
        access_expires_at = ${next.accessExpiresAt},
        exchange_code_hash = ${next.exchangeCodeHash},
        exchange_expires_at = ${next.exchangeExpiresAt},
        installation_id = ${next.installationId},
        platform = ${next.platform},
        device_name = ${next.deviceName},
        app_version = ${next.appVersion},
        idle_expires_at = ${next.idleExpiresAt},
        absolute_expires_at = ${next.absoluteExpiresAt},
        revoked_at = ${next.revokedAt},
        last_seen_at = ${next.lastSeenAt}
      WHERE id = ${id}
    `;
    return next;
  }

  async revokeSession(id: string, at: Date): Promise<void> {
    await this
      .sql`UPDATE sessions SET revoked_at = ${at} WHERE id = ${id} AND revoked_at IS NULL`;
  }

  async revokeOtherSessions(
    userId: string,
    exceptId: string,
    at: Date
  ): Promise<number> {
    const rows = await this.sql`
      UPDATE sessions SET revoked_at = ${at}
      WHERE user_id = ${userId} AND id <> ${exceptId} AND revoked_at IS NULL
    `;
    return rows.count;
  }

  async revokeAllSessions(userId: string, at: Date): Promise<number> {
    const rows = await this.sql`
      UPDATE sessions SET revoked_at = ${at}
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `;
    return rows.count;
  }

  async createWorkspace(
    workspace: Workspace,
    ownerId: string
  ): Promise<Workspace> {
    await this.sql.begin(async tx => {
      await tx`
        INSERT INTO workspaces (
          id, name, is_public, initialized, team, enable_sharing, enable_url_preview, enable_ai, created_at, created_by
        )
        VALUES (
          ${workspace.id}, ${workspace.name}, ${workspace.isPublic}, ${workspace.initialized},
          ${workspace.team}, ${workspace.enableSharing}, ${workspace.enableUrlPreview},
          ${workspace.enableAi}, ${workspace.createdAt}, ${workspace.createdBy}
        )
      `;
      await tx`
        INSERT INTO workspace_members (workspace_id, user_id, role, created_at, invite_id)
        VALUES (${workspace.id}, ${ownerId}, 'owner', ${workspace.createdAt}, ${crypto.randomUUID()})
      `;
    });
    return workspace;
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    const [row] = await this.sql<
      WorkspaceRow[]
    >`SELECT * FROM workspaces WHERE id = ${id}`;
    return row ? mapWorkspace(row) : null;
  }

  async listWorkspacesForUser(userId: string): Promise<Workspace[]> {
    const rows = await this.sql<WorkspaceRow[]>`
      SELECT w.* FROM workspaces w
      INNER JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ${userId}
      ORDER BY w.id
    `;
    return rows.map(mapWorkspace);
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    await this
      .sql`DELETE FROM documents WHERE space_type = 'workspace' AND space_id = ${id}`;
    await this
      .sql`DELETE FROM doc_histories WHERE space_type = 'workspace' AND space_id = ${id}`;
    await this.sql`DELETE FROM blob_uploads WHERE workspace_id = ${id}`;
    await this.sql`DELETE FROM blobs WHERE workspace_id = ${id}`;
    const rows = await this.sql`DELETE FROM workspaces WHERE id = ${id}`;
    return rows.count > 0;
  }

  async getMember(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMember | null> {
    const [row] = await this.sql<
      {
        workspace_id: string;
        user_id: string;
        role: WorkspaceRole;
        invite_id: string;
        created_at: Date;
      }[]
    >`
      SELECT workspace_id, user_id, role, invite_id, created_at
      FROM workspace_members
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    `;
    return row ? mapMember(row) : null;
  }

  async getOwner(workspaceId: string): Promise<User | null> {
    const [row] = await this.sql<UserRow[]>`
      SELECT u.* FROM users u
      INNER JOIN workspace_members m ON m.user_id = u.id
      WHERE m.workspace_id = ${workspaceId} AND m.role = 'owner'
    `;
    return row ? mapUser(row) : null;
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    at: Date,
    inviteId?: string
  ): Promise<void> {
    await this.sql`
      INSERT INTO workspace_members (workspace_id, user_id, role, created_at, invite_id)
      VALUES (${workspaceId}, ${userId}, ${role}, ${at}, ${inviteId ?? crypto.randomUUID()})
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `;
  }

  async getDocument(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<DocumentRecord | null> {
    const [row] = await this.sql<DocumentRow[]>`
      SELECT * FROM documents
      WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
    `;
    return row ? mapDocument(row) : null;
  }

  async upsertDocument(record: DocumentRecord): Promise<DocumentRecord> {
    await this.sql`
      INSERT INTO documents (
        space_type, space_id, doc_id, snapshot, timestamp, lifecycle, update_count
      ) VALUES (
        ${record.spaceType}, ${record.spaceId}, ${record.docId},
        ${record.snapshot}, ${record.timestamp}, ${record.lifecycle}, ${record.updateCount}
      )
      ON CONFLICT (space_type, space_id, doc_id) DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        timestamp = EXCLUDED.timestamp,
        lifecycle = EXCLUDED.lifecycle,
        update_count = EXCLUDED.update_count
    `;
    return record;
  }

  async appendUpdate(input: {
    spaceType: SpaceType;
    spaceId: string;
    docId: string;
    clock: number;
    payload: Uint8Array;
    payloadHash: string;
  }): Promise<{ clock: number; duplicate: boolean }> {
    await this.sql`
      INSERT INTO documents (
        space_type, space_id, doc_id, snapshot, timestamp, lifecycle, update_count
      ) VALUES (
        ${input.spaceType}, ${input.spaceId}, ${input.docId},
        NULL, ${input.clock}, 'active', 0
      )
      ON CONFLICT (space_type, space_id, doc_id) DO NOTHING
    `;
    const inserted = await this.sql<{ clock: string }[]>`
      INSERT INTO doc_updates (space_type, space_id, doc_id, clock, payload, payload_hash)
      VALUES (
        ${input.spaceType}, ${input.spaceId}, ${input.docId},
        ${input.clock}, ${input.payload}, ${input.payloadHash}
      )
      ON CONFLICT (space_type, space_id, doc_id, payload_hash) DO NOTHING
      RETURNING clock::text
    `;
    if (inserted[0]) {
      return { clock: Number(inserted[0].clock), duplicate: false };
    }
    const [existing] = await this.sql<{ clock: string }[]>`
      SELECT clock::text FROM doc_updates
      WHERE space_type = ${input.spaceType}
        AND space_id = ${input.spaceId}
        AND doc_id = ${input.docId}
        AND payload_hash = ${input.payloadHash}
    `;
    return { clock: Number(existing?.clock ?? input.clock), duplicate: true };
  }

  async listUpdates(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<StoredDocUpdate[]> {
    const rows = await this.sql<UpdateRow[]>`
      SELECT clock, payload, payload_hash
      FROM doc_updates
      WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
      ORDER BY clock ASC, id ASC
    `;
    return rows.map(row => ({
      clock: Number(row.clock),
      payload: toBytes(row.payload),
      payloadHash: row.payload_hash,
    }));
  }

  async listTimestamps(
    spaceType: SpaceType,
    spaceId: string,
    after?: number
  ): Promise<Record<string, number>> {
    const rows =
      after === undefined
        ? await this.sql<{ doc_id: string; timestamp: string }[]>`
            SELECT doc_id, timestamp::text
            FROM documents
            WHERE space_type = ${spaceType}
              AND space_id = ${spaceId}
              AND lifecycle <> 'deleted'
          `
        : await this.sql<{ doc_id: string; timestamp: string }[]>`
            SELECT doc_id, timestamp::text
            FROM documents
            WHERE space_type = ${spaceType}
              AND space_id = ${spaceId}
              AND lifecycle <> 'deleted'
              AND timestamp > ${after}
          `;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.doc_id] = Number(row.timestamp);
    }
    return result;
  }

  async deleteDocument(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<boolean> {
    const rows = await this.sql`
      DELETE FROM documents
      WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
    `;
    return rows.count > 0;
  }

  async deleteSpaceDocuments(
    spaceType: SpaceType,
    spaceId: string
  ): Promise<number> {
    const rows = await this.sql`
      DELETE FROM documents WHERE space_type = ${spaceType} AND space_id = ${spaceId}
    `;
    return rows.count;
  }

  async setLifecycle(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    lifecycle: DocLifecycle,
    timestamp: number
  ): Promise<void> {
    await this.sql`
      UPDATE documents
      SET lifecycle = ${lifecycle}, timestamp = ${timestamp}
      WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
    `;
  }

  async compactDocument(input: {
    spaceType: SpaceType;
    spaceId: string;
    docId: string;
    snapshot: Uint8Array;
    timestamp: number;
  }): Promise<void> {
    await this.sql.begin(async tx => {
      await tx`
        DELETE FROM doc_updates
        WHERE space_type = ${input.spaceType}
          AND space_id = ${input.spaceId}
          AND doc_id = ${input.docId}
      `;
      await tx`
        UPDATE documents
        SET snapshot = ${input.snapshot}, timestamp = ${input.timestamp}, update_count = 0
        WHERE space_type = ${input.spaceType}
          AND space_id = ${input.spaceId}
          AND doc_id = ${input.docId}
      `;
    });
  }

  async saveHistory(record: DocHistoryRecord): Promise<void> {
    await this.sql`
      INSERT INTO doc_histories (space_type, space_id, doc_id, timestamp, snapshot, editor_id)
      VALUES (
        ${record.spaceType}, ${record.spaceId}, ${record.docId},
        ${record.timestamp}, ${record.snapshot}, ${record.editorId}
      )
      ON CONFLICT (space_type, space_id, doc_id, timestamp) DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        editor_id = EXCLUDED.editor_id
    `;
  }

  async listHistories(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    opts?: { take?: number; before?: number }
  ): Promise<DocHistoryRecord[]> {
    const take = opts?.take ?? 100;
    const rows =
      opts?.before === undefined
        ? await this.sql<
            {
              timestamp: string;
              snapshot: Uint8Array | Buffer;
              editor_id: string | null;
            }[]
          >`
            SELECT timestamp::text, snapshot, editor_id
            FROM doc_histories
            WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
            ORDER BY timestamp DESC
            LIMIT ${take}
          `
        : await this.sql<
            {
              timestamp: string;
              snapshot: Uint8Array | Buffer;
              editor_id: string | null;
            }[]
          >`
            SELECT timestamp::text, snapshot, editor_id
            FROM doc_histories
            WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
              AND timestamp < ${opts.before}
            ORDER BY timestamp DESC
            LIMIT ${take}
          `;
    return rows.map(row => ({
      spaceType,
      spaceId,
      docId,
      timestamp: Number(row.timestamp),
      snapshot: toBytes(row.snapshot),
      editorId: row.editor_id,
    }));
  }

  async getHistory(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    timestamp: number
  ): Promise<DocHistoryRecord | null> {
    const [row] = await this.sql<
      {
        timestamp: string;
        snapshot: Uint8Array | Buffer;
        editor_id: string | null;
      }[]
    >`
      SELECT timestamp::text, snapshot, editor_id
      FROM doc_histories
      WHERE space_type = ${spaceType} AND space_id = ${spaceId}
        AND doc_id = ${docId} AND timestamp = ${timestamp}
    `;
    return row
      ? {
          spaceType,
          spaceId,
          docId,
          timestamp: Number(row.timestamp),
          snapshot: toBytes(row.snapshot),
          editorId: row.editor_id,
        }
      : null;
  }

  async trimHistories(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    keep: number
  ): Promise<void> {
    await this.sql`
      DELETE FROM doc_histories
      WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
        AND timestamp NOT IN (
          SELECT timestamp FROM doc_histories
          WHERE space_type = ${spaceType} AND space_id = ${spaceId} AND doc_id = ${docId}
          ORDER BY timestamp DESC
          LIMIT ${keep}
        )
    `;
  }

  async getBlob(workspaceId: string, key: string): Promise<StoredBlob | null> {
    const [row] = await this.sql<BlobRow[]>`
      SELECT * FROM blobs WHERE workspace_id = ${workspaceId} AND key = ${key}
    `;
    return row ? mapBlob(row) : null;
  }

  async upsertBlob(record: StoredBlob): Promise<StoredBlob> {
    await this.sql`
      INSERT INTO blobs (
        workspace_id, key, mime, size, payload_hash, created_by, created_at, deleted_at
      ) VALUES (
        ${record.workspaceId}, ${record.key}, ${record.mime}, ${record.size},
        ${record.payloadHash}, ${record.createdBy}, ${record.createdAt}, ${record.deletedAt}
      )
      ON CONFLICT (workspace_id, key) DO UPDATE SET
        mime = EXCLUDED.mime,
        size = EXCLUDED.size,
        payload_hash = EXCLUDED.payload_hash,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        deleted_at = EXCLUDED.deleted_at
    `;
    return record;
  }

  async listBlobs(
    workspaceId: string,
    opts?: { includeDeleted?: boolean }
  ): Promise<StoredBlob[]> {
    const rows = opts?.includeDeleted
      ? await this.sql<BlobRow[]>`
          SELECT * FROM blobs WHERE workspace_id = ${workspaceId} ORDER BY key
        `
      : await this.sql<BlobRow[]>`
          SELECT * FROM blobs
          WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
          ORDER BY key
        `;
    return rows.map(mapBlob);
  }

  async markBlobDeleted(
    workspaceId: string,
    key: string,
    at: Date
  ): Promise<boolean> {
    const rows = await this.sql`
      UPDATE blobs SET deleted_at = ${at}
      WHERE workspace_id = ${workspaceId} AND key = ${key}
    `;
    return rows.count > 0;
  }

  async deleteBlob(workspaceId: string, key: string): Promise<boolean> {
    const rows = await this.sql`
      DELETE FROM blobs WHERE workspace_id = ${workspaceId} AND key = ${key}
    `;
    return rows.count > 0;
  }

  async deleteWorkspaceBlobs(workspaceId: string): Promise<string[]> {
    const rows = await this.sql<{ key: string }[]>`
      DELETE FROM blobs WHERE workspace_id = ${workspaceId} RETURNING key
    `;
    await this
      .sql`DELETE FROM blob_uploads WHERE workspace_id = ${workspaceId}`;
    return rows.map(row => row.key);
  }

  async usedStorage(workspaceId: string): Promise<number> {
    const [row] = await this.sql<{ total: string | number | null }[]>`
      SELECT COALESCE(SUM(size), 0)::text AS total
      FROM blobs
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
    `;
    return Number(row?.total ?? 0);
  }

  async createUpload(session: BlobUploadSession): Promise<BlobUploadSession> {
    await this.sql`
      INSERT INTO blob_uploads (
        id, token, workspace_id, key, mime, size, method, part_size,
        expires_at, created_by, created_at
      ) VALUES (
        ${session.id}, ${session.token}, ${session.workspaceId}, ${session.key},
        ${session.mime}, ${session.size}, ${session.method}, ${session.partSize},
        ${session.expiresAt}, ${session.createdBy}, ${session.createdAt}
      )
    `;
    return session;
  }

  async getUpload(uploadId: string): Promise<BlobUploadSession | null> {
    const [row] = await this.sql<
      UploadRow[]
    >`SELECT * FROM blob_uploads WHERE id = ${uploadId}`;
    return row ? mapUpload(row) : null;
  }

  async getUploadByToken(token: string): Promise<BlobUploadSession | null> {
    const [row] = await this.sql<
      UploadRow[]
    >`SELECT * FROM blob_uploads WHERE token = ${token}`;
    return row ? mapUpload(row) : null;
  }

  async findUpload(
    workspaceId: string,
    key: string
  ): Promise<BlobUploadSession | null> {
    const [row] = await this.sql<UploadRow[]>`
      SELECT * FROM blob_uploads
      WHERE workspace_id = ${workspaceId} AND key = ${key}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return row ? mapUpload(row) : null;
  }

  async deleteUpload(uploadId: string): Promise<void> {
    await this.sql`DELETE FROM blob_uploads WHERE id = ${uploadId}`;
  }

  async putPart(part: BlobUploadPart): Promise<BlobUploadPart> {
    await this.sql`
      INSERT INTO blob_upload_parts (upload_id, part_number, etag, token, size)
      VALUES (${part.uploadId}, ${part.partNumber}, ${part.etag}, ${part.token}, ${part.size})
      ON CONFLICT (upload_id, part_number) DO UPDATE SET
        etag = EXCLUDED.etag,
        token = EXCLUDED.token,
        size = EXCLUDED.size
    `;
    return part;
  }

  async getPartByToken(token: string): Promise<BlobUploadPart | null> {
    const [row] = await this.sql<PartRow[]>`
      SELECT * FROM blob_upload_parts WHERE token = ${token}
    `;
    return row ? mapPart(row) : null;
  }

  async listParts(uploadId: string): Promise<BlobUploadPart[]> {
    const rows = await this.sql<PartRow[]>`
      SELECT * FROM blob_upload_parts WHERE upload_id = ${uploadId} ORDER BY part_number
    `;
    return rows.map(mapPart);
  }

  async updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
    const current = await this.getWorkspace(id);
    if (!current) {
      throw errors.spaceNotFound();
    }
    const next: Workspace = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
      ...(patch.enableSharing !== undefined
        ? { enableSharing: patch.enableSharing }
        : {}),
      ...(patch.enableUrlPreview !== undefined
        ? { enableUrlPreview: patch.enableUrlPreview }
        : {}),
      ...(patch.enableAi !== undefined ? { enableAi: patch.enableAi } : {}),
    };
    await this.sql`
      UPDATE workspaces SET
        name = ${next.name},
        is_public = ${next.isPublic},
        enable_sharing = ${next.enableSharing},
        enable_url_preview = ${next.enableUrlPreview},
        enable_ai = ${next.enableAi}
      WHERE id = ${id}
    `;
    return next;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.sql<MemberRow[]>`
      SELECT workspace_id, user_id, role, invite_id, created_at
      FROM workspace_members
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at
    `;
    return rows.map(mapMember);
  }

  async countMembers(workspaceId: string): Promise<number> {
    const [row] = await this.sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM workspace_members WHERE workspace_id = ${workspaceId}
    `;
    return Number(row?.count ?? 0);
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    `;
    return result.count > 0;
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<void> {
    const result = await this.sql`
      UPDATE workspace_members SET role = ${role}
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    `;
    if (result.count === 0) {
      throw errors.memberNotFoundInSpace(workspaceId);
    }
  }

  async createInvitation(
    invite: WorkspaceInvitation
  ): Promise<WorkspaceInvitation> {
    await this.sql`
      INSERT INTO workspace_invitations (
        id, workspace_id, email, invitee_id, inviter_id, role, status, created_at, accepted_at
      )
      VALUES (
        ${invite.id}, ${invite.workspaceId}, ${invite.email}, ${invite.inviteeId},
        ${invite.inviterId}, ${invite.role}, ${invite.status}, ${invite.createdAt}, ${invite.acceptedAt}
      )
    `;
    return invite;
  }

  async getInvitation(id: string): Promise<WorkspaceInvitation | null> {
    const [row] = await this.sql<
      InvitationRow[]
    >`SELECT * FROM workspace_invitations WHERE id = ${id}`;
    return row ? mapInvitation(row) : null;
  }

  async findInvitationByEmail(
    workspaceId: string,
    email: string
  ): Promise<WorkspaceInvitation | null> {
    const [row] = await this.sql<InvitationRow[]>`
      SELECT * FROM workspace_invitations
      WHERE workspace_id = ${workspaceId} AND email = ${email}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return row ? mapInvitation(row) : null;
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const rows = await this.sql<InvitationRow[]>`
      SELECT * FROM workspace_invitations WHERE workspace_id = ${workspaceId} ORDER BY created_at
    `;
    return rows.map(mapInvitation);
  }

  async updateInvitation(
    id: string,
    patch: Partial<
      Pick<WorkspaceInvitation, 'status' | 'inviteeId' | 'acceptedAt'>
    >
  ): Promise<WorkspaceInvitation> {
    const current = await this.getInvitation(id);
    if (!current) {
      throw errors.invalidInvitation();
    }
    const next = { ...current, ...patch };
    await this.sql`
      UPDATE workspace_invitations SET
        status = ${next.status},
        invitee_id = ${next.inviteeId},
        accepted_at = ${next.acceptedAt}
      WHERE id = ${id}
    `;
    return next;
  }

  async deleteInvitation(id: string): Promise<void> {
    await this.sql`DELETE FROM workspace_invitations WHERE id = ${id}`;
  }

  async upsertInviteLink(
    link: WorkspaceInviteLink
  ): Promise<WorkspaceInviteLink> {
    await this.sql`
      INSERT INTO workspace_invite_links (workspace_id, token, expire_at, created_by, created_at)
      VALUES (${link.workspaceId}, ${link.token}, ${link.expireAt}, ${link.createdBy}, ${link.createdAt})
      ON CONFLICT (workspace_id) DO UPDATE SET
        token = EXCLUDED.token,
        expire_at = EXCLUDED.expire_at,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at
    `;
    return link;
  }

  async getInviteLink(
    workspaceId: string
  ): Promise<WorkspaceInviteLink | null> {
    const [row] = await this.sql<InviteLinkRow[]>`
      SELECT * FROM workspace_invite_links WHERE workspace_id = ${workspaceId}
    `;
    return row ? mapInviteLink(row) : null;
  }

  async getInviteLinkByToken(
    token: string
  ): Promise<WorkspaceInviteLink | null> {
    const [row] = await this.sql<InviteLinkRow[]>`
      SELECT * FROM workspace_invite_links WHERE token = ${token}
    `;
    return row ? mapInviteLink(row) : null;
  }

  async deleteInviteLink(workspaceId: string): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM workspace_invite_links WHERE workspace_id = ${workspaceId}
    `;
    return result.count > 0;
  }

  async publishDoc(doc: PublicDoc): Promise<PublicDoc> {
    await this.sql`
      INSERT INTO public_docs (workspace_id, doc_id, mode, published_at, published_by)
      VALUES (${doc.workspaceId}, ${doc.docId}, ${doc.mode}, ${doc.publishedAt}, ${doc.publishedBy})
      ON CONFLICT (workspace_id, doc_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        published_at = EXCLUDED.published_at,
        published_by = EXCLUDED.published_by
    `;
    return doc;
  }

  async getPublicDoc(
    workspaceId: string,
    docId: string
  ): Promise<PublicDoc | null> {
    const [row] = await this.sql<PublicDocRow[]>`
      SELECT * FROM public_docs WHERE workspace_id = ${workspaceId} AND doc_id = ${docId}
    `;
    return row ? mapPublicDoc(row) : null;
  }

  async listPublicDocs(workspaceId: string): Promise<PublicDoc[]> {
    const rows = await this.sql<PublicDocRow[]>`
      SELECT * FROM public_docs WHERE workspace_id = ${workspaceId} ORDER BY published_at
    `;
    return rows.map(mapPublicDoc);
  }

  async revokePublicDoc(
    workspaceId: string,
    docId: string
  ): Promise<PublicDoc | null> {
    const existing = await this.getPublicDoc(workspaceId, docId);
    await this.sql`
      DELETE FROM public_docs WHERE workspace_id = ${workspaceId} AND doc_id = ${docId}
    `;
    return existing;
  }

  async createComment(comment: CommentRecord): Promise<CommentRecord> {
    await this.sql`
      INSERT INTO comments (id, workspace_id, doc_id, user_id, content, resolved, created_at, updated_at)
      VALUES (
        ${comment.id}, ${comment.workspaceId}, ${comment.docId}, ${comment.userId},
        ${this.sql.json(asJson(comment.content))}, ${comment.resolved}, ${comment.createdAt}, ${comment.updatedAt}
      )
    `;
    return comment;
  }

  async getComment(id: string): Promise<CommentRecord | null> {
    const [row] = await this.sql<
      CommentRow[]
    >`SELECT * FROM comments WHERE id = ${id}`;
    return row ? mapComment(row) : null;
  }

  async listComments(
    workspaceId: string,
    docId: string,
    pagination?: Pagination
  ): Promise<{
    items: CommentRecord[];
    totalCount: number;
    hasNextPage: boolean;
  }> {
    const rows = await this.sql<CommentRow[]>`
      SELECT * FROM comments
      WHERE workspace_id = ${workspaceId} AND doc_id = ${docId}
      ORDER BY created_at ASC, id ASC
    `;
    return paginate(rows.map(mapComment), pagination);
  }

  async updateComment(
    id: string,
    patch: Partial<Pick<CommentRecord, 'content' | 'resolved' | 'updatedAt'>>
  ): Promise<CommentRecord> {
    const current = await this.getComment(id);
    if (!current) {
      throw errors.commentNotFound();
    }
    const next = { ...current, ...patch };
    await this.sql`
      UPDATE comments SET
        content = ${this.sql.json(asJson(next.content))},
        resolved = ${next.resolved},
        updated_at = ${next.updatedAt}
      WHERE id = ${id}
    `;
    return next;
  }

  async deleteComment(id: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM comments WHERE id = ${id}`;
    return result.count > 0;
  }

  async createReply(reply: CommentReplyRecord): Promise<CommentReplyRecord> {
    await this.sql`
      INSERT INTO comment_replies (id, comment_id, user_id, content, created_at, updated_at)
      VALUES (
        ${reply.id}, ${reply.commentId}, ${reply.userId},
        ${this.sql.json(asJson(reply.content))}, ${reply.createdAt}, ${reply.updatedAt}
      )
    `;
    return reply;
  }

  async getReply(id: string): Promise<CommentReplyRecord | null> {
    const [row] = await this.sql<
      ReplyRow[]
    >`SELECT * FROM comment_replies WHERE id = ${id}`;
    return row ? mapReply(row) : null;
  }

  async listReplies(commentId: string): Promise<CommentReplyRecord[]> {
    const rows = await this.sql<ReplyRow[]>`
      SELECT * FROM comment_replies WHERE comment_id = ${commentId} ORDER BY created_at ASC, id ASC
    `;
    return rows.map(mapReply);
  }

  async listRepliesForComments(
    commentIds: string[]
  ): Promise<CommentReplyRecord[]> {
    if (commentIds.length === 0) {
      return [];
    }
    const rows = await this.sql<ReplyRow[]>`
      SELECT * FROM comment_replies WHERE comment_id IN ${this.sql(commentIds)}
    `;
    return rows.map(mapReply);
  }

  async updateReply(
    id: string,
    patch: Partial<Pick<CommentReplyRecord, 'content' | 'updatedAt'>>
  ): Promise<CommentReplyRecord> {
    const current = await this.getReply(id);
    if (!current) {
      throw errors.commentNotFound();
    }
    const next = { ...current, ...patch };
    await this.sql`
      UPDATE comment_replies SET
        content = ${this.sql.json(asJson(next.content))},
        updated_at = ${next.updatedAt}
      WHERE id = ${id}
    `;
    return next;
  }

  async deleteReply(id: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM comment_replies WHERE id = ${id}`;
    return result.count > 0;
  }

  async appendCommentChange(
    change: Omit<CommentChangeRecord, 'id'>
  ): Promise<CommentChangeRecord> {
    const [row] = await this.sql<{ id: string }[]>`
      INSERT INTO comment_changes (
        workspace_id, doc_id, action, item, comment_id, entity_id, created_at
      )
      VALUES (
        ${change.workspaceId}, ${change.docId}, ${change.action},
        ${this.sql.json(asJson(change.item))}, ${change.commentId}, ${change.entityId}, ${change.createdAt}
      )
      RETURNING id::text AS id
    `;
    return { ...change, id: row?.id ?? '0' };
  }

  async listCommentChanges(
    workspaceId: string,
    docId: string,
    pagination?: Pagination
  ): Promise<{
    items: CommentChangeRecord[];
    totalCount: number;
    hasNextPage: boolean;
  }> {
    const rows = await this.sql<ChangeRow[]>`
      SELECT id::text AS id, workspace_id, doc_id, action, item, comment_id, entity_id, created_at
      FROM comment_changes
      WHERE workspace_id = ${workspaceId} AND doc_id = ${docId}
      ORDER BY created_at ASC, id ASC
    `;
    return paginate(rows.map(mapChange), pagination);
  }

  async linkOauthAccount(account: OauthAccount): Promise<OauthAccount> {
    await this.sql`
      INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id)
      VALUES (${account.id}, ${account.userId}, ${account.provider}, ${account.providerAccountId})
      ON CONFLICT (provider, provider_account_id) DO UPDATE SET user_id = EXCLUDED.user_id
    `;
    return account;
  }

  async findOauthAccount(
    provider: string,
    providerAccountId: string
  ): Promise<OauthAccount | null> {
    const [row] = await this.sql<OauthRow[]>`
      SELECT id, user_id, provider, provider_account_id
      FROM oauth_accounts
      WHERE provider = ${provider} AND provider_account_id = ${providerAccountId}
    `;
    return row ? mapOauth(row) : null;
  }

  async listOauthProviders(userId: string): Promise<string[]> {
    const rows = await this.sql<{ provider: string }[]>`
      SELECT DISTINCT provider FROM oauth_accounts WHERE user_id = ${userId}
    `;
    return rows.map(row => row.provider);
  }

  async appendAudit(event: AuditEvent): Promise<AuditEvent> {
    await this.sql`
      INSERT INTO audit_events (
        id, workspace_id, actor_id, actor_type, action, target_type, target_id,
        metadata, ip, user_agent, created_at
      ) VALUES (
        ${event.id}, ${event.workspaceId}, ${event.actorId}, ${event.actorType},
        ${event.action}, ${event.targetType}, ${event.targetId},
        ${this.sql.json(asJson(event.metadata))}, ${event.ip}, ${event.userAgent}, ${event.createdAt}
      )
    `;
    return event;
  }

  async listAudit(query: AuditQuery): Promise<AuditEvent[]> {
    const take = Math.min(500, Math.max(1, query.take ?? 100));
    const rows = await this.sql<AuditRow[]>`
      SELECT
        id, workspace_id, actor_id, actor_type, action, target_type, target_id,
        metadata, ip, user_agent, created_at
      FROM audit_events
      WHERE (${query.workspaceId ?? null}::uuid IS NULL OR workspace_id = ${query.workspaceId ?? null})
        AND (${query.actorId ?? null}::uuid IS NULL OR actor_id = ${query.actorId ?? null})
        AND (${query.action ?? null}::text IS NULL OR action = ${query.action ?? null})
        AND (${query.after ?? null}::timestamptz IS NULL OR created_at > ${query.after ?? null})
      ORDER BY created_at DESC
      LIMIT ${take}
    `;
    return rows.map(mapAudit);
  }

  async getSecurityPolicy(
    workspaceId: string | null
  ): Promise<SecurityPolicy | null> {
    if (workspaceId) {
      const [row] = await this.sql<PolicyRow[]>`
        SELECT workspace_id, allowed_guest_domains, block_public_links, require_sso,
               require_sso_domains, session_max_duration_sec, updated_at
        FROM workspace_security_policies WHERE workspace_id = ${workspaceId}
      `;
      return row ? mapPolicy(row) : null;
    }
    const [row] = await this.sql<PolicyRow[]>`
      SELECT NULL::uuid AS workspace_id, allowed_guest_domains, block_public_links, require_sso,
             require_sso_domains, session_max_duration_sec, updated_at
      FROM instance_security_policy WHERE id = 1
    `;
    return row ? mapPolicy(row) : null;
  }

  async upsertSecurityPolicy(policy: SecurityPolicy): Promise<SecurityPolicy> {
    if (policy.workspaceId) {
      await this.sql`
        INSERT INTO workspace_security_policies (
          workspace_id, allowed_guest_domains, block_public_links, require_sso,
          require_sso_domains, session_max_duration_sec, updated_at
        ) VALUES (
          ${policy.workspaceId}, ${policy.allowedGuestDomains}, ${policy.blockPublicLinks},
          ${policy.requireSso}, ${policy.requireSsoDomains}, ${policy.sessionMaxDurationSec},
          ${policy.updatedAt}
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
          allowed_guest_domains = EXCLUDED.allowed_guest_domains,
          block_public_links = EXCLUDED.block_public_links,
          require_sso = EXCLUDED.require_sso,
          require_sso_domains = EXCLUDED.require_sso_domains,
          session_max_duration_sec = EXCLUDED.session_max_duration_sec,
          updated_at = EXCLUDED.updated_at
      `;
      return policy;
    }
    await this.sql`
      INSERT INTO instance_security_policy (
        id, allowed_guest_domains, block_public_links, require_sso,
        require_sso_domains, session_max_duration_sec, updated_at
      ) VALUES (
        1, ${policy.allowedGuestDomains}, ${policy.blockPublicLinks},
        ${policy.requireSso}, ${policy.requireSsoDomains}, ${policy.sessionMaxDurationSec},
        ${policy.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        allowed_guest_domains = EXCLUDED.allowed_guest_domains,
        block_public_links = EXCLUDED.block_public_links,
        require_sso = EXCLUDED.require_sso,
        require_sso_domains = EXCLUDED.require_sso_domains,
        session_max_duration_sec = EXCLUDED.session_max_duration_sec,
        updated_at = EXCLUDED.updated_at
    `;
    return policy;
  }

  async createWebhook(hook: WorkspaceWebhook): Promise<WorkspaceWebhook> {
    await this.sql`
      INSERT INTO workspace_webhooks (id, workspace_id, url, secret, events, active, created_at)
      VALUES (${hook.id}, ${hook.workspaceId}, ${hook.url}, ${hook.secret}, ${hook.events}, ${hook.active}, ${hook.createdAt})
    `;
    return hook;
  }

  async getWebhook(id: string): Promise<WorkspaceWebhook | null> {
    const [row] = await this.sql<WebhookRow[]>`
      SELECT id, workspace_id, url, secret, events, active, created_at
      FROM workspace_webhooks WHERE id = ${id}
    `;
    return row ? mapWebhook(row) : null;
  }

  async listWebhooks(workspaceId: string): Promise<WorkspaceWebhook[]> {
    const rows = await this.sql<WebhookRow[]>`
      SELECT id, workspace_id, url, secret, events, active, created_at
      FROM workspace_webhooks WHERE workspace_id = ${workspaceId}
      ORDER BY created_at ASC
    `;
    return rows.map(mapWebhook);
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const result = await this
      .sql`DELETE FROM workspace_webhooks WHERE id = ${id}`;
    return result.count > 0;
  }

  async createCopilotSession(
    session: CopilotSessionRecord
  ): Promise<CopilotSessionRecord> {
    await this.sql`
      INSERT INTO copilot_sessions (
        id, workspace_id, user_id, doc_id, prompt_name, title, pinned, created_at, updated_at
      ) VALUES (
        ${session.id}, ${session.workspaceId}, ${session.userId}, ${session.docId},
        ${session.promptName}, ${session.title}, ${session.pinned}, ${session.createdAt}, ${session.updatedAt}
      )
    `;
    return session;
  }

  async getCopilotSession(id: string): Promise<CopilotSessionRecord | null> {
    const [row] = await this.sql<CopilotSessionRow[]>`
      SELECT id, workspace_id, user_id, doc_id, prompt_name, title, pinned, created_at, updated_at
      FROM copilot_sessions WHERE id = ${id}
    `;
    return row ? mapCopilotSession(row) : null;
  }

  async listCopilotSessions(
    userId: string,
    workspaceId: string
  ): Promise<CopilotSessionRecord[]> {
    const rows = await this.sql<CopilotSessionRow[]>`
      SELECT id, workspace_id, user_id, doc_id, prompt_name, title, pinned, created_at, updated_at
      FROM copilot_sessions WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
      ORDER BY updated_at DESC
    `;
    return rows.map(mapCopilotSession);
  }

  async countCopilotSessions(userId: string): Promise<number> {
    const [row] = await this.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM copilot_sessions WHERE user_id = ${userId}
    `;
    return Number(row?.count ?? 0);
  }

  async appendCopilotMessage(
    message: CopilotMessageRecord
  ): Promise<CopilotMessageRecord> {
    await this.sql`
      INSERT INTO copilot_messages (id, session_id, role, content, created_at)
      VALUES (${message.id}, ${message.sessionId}, ${message.role}, ${message.content}, ${message.createdAt})
    `;
    return message;
  }

  async listCopilotMessages(
    sessionId: string
  ): Promise<CopilotMessageRecord[]> {
    const rows = await this.sql<CopilotMessageRow[]>`
      SELECT id, session_id, role, content, created_at
      FROM copilot_messages WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `;
    return rows.map(mapCopilotMessage);
  }
}

interface OauthRow {
  id: string;
  user_id: string;
  provider: string;
  provider_account_id: string;
}

interface AuditRow {
  id: string;
  workspace_id: string | null;
  actor_id: string | null;
  actor_type: AuditEvent['actorType'];
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
}

interface PolicyRow {
  workspace_id: string | null;
  allowed_guest_domains: string[];
  block_public_links: boolean;
  require_sso: boolean;
  require_sso_domains: string[];
  session_max_duration_sec: number | null;
  updated_at: Date;
}

interface WebhookRow {
  id: string;
  workspace_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: Date;
}

interface CopilotSessionRow {
  id: string;
  workspace_id: string;
  user_id: string;
  doc_id: string | null;
  prompt_name: string;
  title: string | null;
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CopilotMessageRow {
  id: string;
  session_id: string;
  role: CopilotMessageRecord['role'];
  content: string;
  created_at: Date;
}

function mapOauth(row: OauthRow): OauthAccount {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
  };
}

function mapAudit(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    actorType: row.actor_type,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata ?? {},
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

function mapPolicy(row: PolicyRow): SecurityPolicy {
  return {
    workspaceId: row.workspace_id,
    allowedGuestDomains: row.allowed_guest_domains ?? [],
    blockPublicLinks: row.block_public_links,
    requireSso: row.require_sso,
    requireSsoDomains: row.require_sso_domains ?? [],
    sessionMaxDurationSec: row.session_max_duration_sec,
    updatedAt: row.updated_at,
  };
}

function mapWebhook(row: WebhookRow): WorkspaceWebhook {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    url: row.url,
    secret: row.secret,
    events: row.events ?? [],
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapCopilotSession(row: CopilotSessionRow): CopilotSessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    docId: row.doc_id,
    promptName: row.prompt_name,
    title: row.title,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCopilotMessage(row: CopilotMessageRow): CopilotMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}
