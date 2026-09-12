import { errors } from '../../domain/errors.js';
import type {
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
import { docKey } from '../../domain/doc.js';
import type {
  Credential,
  Session,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '../../domain/identity.js';
import type {
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
import type { PublicDoc } from '../../domain/share.js';

function cloneUser(user: User): User {
  return {
    ...user,
    features: [...user.features],
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

function cloneDocument(record: DocumentRecord): DocumentRecord {
  return {
    ...record,
    snapshot: record.snapshot ? Uint8Array.from(record.snapshot) : null,
  };
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    idleExpiresAt: new Date(session.idleExpiresAt),
    absoluteExpiresAt: new Date(session.absoluteExpiresAt),
    createdAt: new Date(session.createdAt),
    lastSeenAt: new Date(session.lastSeenAt),
    refreshExpiresAt: session.refreshExpiresAt
      ? new Date(session.refreshExpiresAt)
      : null,
    accessExpiresAt: session.accessExpiresAt
      ? new Date(session.accessExpiresAt)
      : null,
    exchangeExpiresAt: session.exchangeExpiresAt
      ? new Date(session.exchangeExpiresAt)
      : null,
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
  };
}

export class MemoryStore implements MosaicStore {
  readonly kind = 'memory' as const;

  private readonly users = new Map<string, User>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly credentials = new Map<string, Credential>();
  private readonly sessions = new Map<string, Session>();
  private readonly workspaces = new Map<string, Workspace>();
  private readonly members = new Map<string, WorkspaceMember[]>();
  private readonly documents = new Map<string, DocumentRecord>();
  private readonly updates = new Map<string, StoredDocUpdate[]>();
  private readonly blobs = new Map<string, StoredBlob>();
  private readonly uploads = new Map<string, BlobUploadSession>();
  private readonly uploadParts = new Map<string, BlobUploadPart[]>();
  private readonly histories = new Map<string, DocHistoryRecord[]>();
  private readonly invitations = new Map<string, WorkspaceInvitation>();
  private readonly inviteLinks = new Map<string, WorkspaceInviteLink>();
  private readonly publicDocs = new Map<string, PublicDoc>();
  private readonly comments = new Map<string, CommentRecord>();
  private readonly replies = new Map<string, CommentReplyRecord>();
  private readonly commentChanges: CommentChangeRecord[] = [];
  private commentChangeSeq = 0;
  private readonly oauthAccounts = new Map<string, OauthAccount>();
  private readonly auditEvents: AuditEvent[] = [];
  private readonly securityPolicies = new Map<string, SecurityPolicy>();
  private readonly webhooks = new Map<string, WorkspaceWebhook>();
  private readonly copilotSessions = new Map<string, CopilotSessionRecord>();
  private readonly copilotMessages = new Map<string, CopilotMessageRecord[]>();

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async findUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? cloneUser(user) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const id = this.usersByEmail.get(email);
    return id ? this.findUserById(id) : null;
  }

  async createUser(user: User, passwordHash: string | null): Promise<User> {
    if (this.usersByEmail.has(user.email)) {
      throw errors.emailAlreadyUsed();
    }
    this.users.set(user.id, cloneUser(user));
    this.usersByEmail.set(user.email, user.id);
    if (passwordHash) {
      this.credentials.set(user.id, {
        userId: user.id,
        passwordHash,
        updatedAt: new Date(user.updatedAt),
      });
    }
    return cloneUser(user);
  }

  async updateUser(
    id: string,
    patch: Partial<
      Pick<User, 'name' | 'avatarUrl' | 'emailVerified' | 'features'>
    >
  ): Promise<User> {
    const current = this.users.get(id);
    if (!current) {
      throw new Error('user not found');
    }
    const next: User = {
      ...current,
      ...patch,
      features: patch.features ? [...patch.features] : current.features,
      updatedAt: new Date(),
    };
    this.users.set(id, next);
    return cloneUser(next);
  }

  async getCredential(userId: string): Promise<Credential | null> {
    const credential = this.credentials.get(userId);
    return credential ? { ...credential } : null;
  }

  async createSession(session: Session): Promise<Session> {
    this.sessions.set(session.id, cloneSession(session));
    return cloneSession(session);
  }

  async findSessionById(id: string): Promise<Session | null> {
    const session = this.sessions.get(id);
    return session ? cloneSession(session) : null;
  }

  async findSessionByTokenHash(hash: string): Promise<Session | null> {
    return this.findSession(session => session.tokenHash === hash);
  }

  async findSessionByAccessHash(hash: string): Promise<Session | null> {
    return this.findSession(session => session.accessTokenHash === hash);
  }

  async findSessionByRefreshHash(hash: string): Promise<Session | null> {
    return this.findSession(session => session.refreshTokenHash === hash);
  }

  async findSessionByExchangeHash(hash: string): Promise<Session | null> {
    return this.findSession(session => session.exchangeCodeHash === hash);
  }

  async listSessionsByUser(userId: string): Promise<Session[]> {
    return [...this.sessions.values()]
      .filter(session => session.userId === userId)
      .map(cloneSession);
  }

  async updateSession(id: string, patch: Partial<Session>): Promise<Session> {
    const current = this.sessions.get(id);
    if (!current) {
      throw new Error('session not found');
    }
    const next = cloneSession({ ...current, ...patch, id: current.id });
    this.sessions.set(id, next);
    return cloneSession(next);
  }

  async revokeSession(id: string, at: Date): Promise<void> {
    const current = this.sessions.get(id);
    if (!current) {
      return;
    }
    this.sessions.set(id, cloneSession({ ...current, revokedAt: at }));
  }

  async revokeOtherSessions(
    userId: string,
    exceptId: string,
    at: Date
  ): Promise<number> {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.id !== exceptId &&
        !session.revokedAt
      ) {
        this.sessions.set(
          session.id,
          cloneSession({ ...session, revokedAt: at })
        );
        count += 1;
      }
    }
    return count;
  }

  async revokeAllSessions(userId: string, at: Date): Promise<number> {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        this.sessions.set(
          session.id,
          cloneSession({ ...session, revokedAt: at })
        );
        count += 1;
      }
    }
    return count;
  }

  async createWorkspace(
    workspace: Workspace,
    ownerId: string
  ): Promise<Workspace> {
    this.workspaces.set(workspace.id, { ...workspace });
    this.members.set(workspace.id, [
      {
        workspaceId: workspace.id,
        userId: ownerId,
        role: 'owner',
        inviteId: crypto.randomUUID(),
        createdAt: new Date(workspace.createdAt),
      },
    ]);
    return { ...workspace };
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    const workspace = this.workspaces.get(id);
    return workspace ? { ...workspace } : null;
  }

  async listWorkspacesForUser(userId: string): Promise<Workspace[]> {
    const result: Workspace[] = [];
    for (const [workspaceId, members] of this.members) {
      if (members.some(member => member.userId === userId)) {
        const workspace = this.workspaces.get(workspaceId);
        if (workspace) {
          result.push({ ...workspace });
        }
      }
    }
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    const existed = this.workspaces.delete(id);
    this.members.delete(id);
    this.inviteLinks.delete(id);
    for (const [inviteId, invite] of this.invitations) {
      if (invite.workspaceId === id) {
        this.invitations.delete(inviteId);
      }
    }
    for (const [key, doc] of this.publicDocs) {
      if (doc.workspaceId === id) {
        this.publicDocs.delete(key);
      }
    }
    for (const [commentId, comment] of this.comments) {
      if (comment.workspaceId === id) {
        this.comments.delete(commentId);
      }
    }
    for (const [replyId, reply] of this.replies) {
      if (!this.comments.has(reply.commentId)) {
        this.replies.delete(replyId);
      }
    }
    for (let i = this.commentChanges.length - 1; i >= 0; i -= 1) {
      if (this.commentChanges[i]?.workspaceId === id) {
        this.commentChanges.splice(i, 1);
      }
    }
    await this.deleteSpaceDocuments('workspace', id);
    await this.deleteWorkspaceBlobs(id);
    return existed;
  }

  async getMember(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMember | null> {
    const member = this.members
      .get(workspaceId)
      ?.find(item => item.userId === userId);
    return member ? { ...member } : null;
  }

  async getOwner(workspaceId: string): Promise<User | null> {
    const owner = this.members
      .get(workspaceId)
      ?.find(member => member.role === 'owner');
    return owner ? this.findUserById(owner.userId) : null;
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    at: Date,
    inviteId?: string
  ): Promise<void> {
    const list = this.members.get(workspaceId) ?? [];
    if (list.some(member => member.userId === userId)) {
      return;
    }
    list.push({
      workspaceId,
      userId,
      role,
      inviteId: inviteId ?? crypto.randomUUID(),
      createdAt: at,
    });
    this.members.set(workspaceId, list);
  }

  async getDocument(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<DocumentRecord | null> {
    const record = this.documents.get(docKey(spaceType, spaceId, docId));
    return record ? cloneDocument(record) : null;
  }

  async upsertDocument(record: DocumentRecord): Promise<DocumentRecord> {
    const key = docKey(record.spaceType, record.spaceId, record.docId);
    const stored = cloneDocument(record);
    this.documents.set(key, stored);
    if (!this.updates.has(key)) {
      this.updates.set(key, []);
    }
    return cloneDocument(stored);
  }

  async appendUpdate(input: {
    spaceType: SpaceType;
    spaceId: string;
    docId: string;
    clock: number;
    payload: Uint8Array;
    payloadHash: string;
  }): Promise<{ clock: number; duplicate: boolean }> {
    const key = docKey(input.spaceType, input.spaceId, input.docId);
    const list = this.updates.get(key) ?? [];
    const duplicate = list.find(item => item.payloadHash === input.payloadHash);
    if (duplicate) {
      return { clock: duplicate.clock, duplicate: true };
    }
    list.push({
      clock: input.clock,
      payload: Uint8Array.from(input.payload),
      payloadHash: input.payloadHash,
    });
    this.updates.set(key, list);
    if (!this.documents.has(key)) {
      this.documents.set(key, {
        spaceType: input.spaceType,
        spaceId: input.spaceId,
        docId: input.docId,
        snapshot: null,
        timestamp: input.clock,
        lifecycle: 'active',
        updateCount: 0,
      });
    }
    return { clock: input.clock, duplicate: false };
  }

  async listUpdates(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<StoredDocUpdate[]> {
    const list = this.updates.get(docKey(spaceType, spaceId, docId)) ?? [];
    return list
      .slice()
      .sort((a, b) => a.clock - b.clock)
      .map(item => ({
        clock: item.clock,
        payload: Uint8Array.from(item.payload),
        payloadHash: item.payloadHash,
      }));
  }

  async listTimestamps(
    spaceType: SpaceType,
    spaceId: string,
    after?: number
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const record of this.documents.values()) {
      if (record.spaceType !== spaceType || record.spaceId !== spaceId) {
        continue;
      }
      if (record.lifecycle === 'deleted') {
        continue;
      }
      if (after !== undefined && record.timestamp <= after) {
        continue;
      }
      result[record.docId] = record.timestamp;
    }
    return result;
  }

  async deleteDocument(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<boolean> {
    const key = docKey(spaceType, spaceId, docId);
    this.updates.delete(key);
    this.histories.delete(key);
    return this.documents.delete(key);
  }

  async deleteSpaceDocuments(
    spaceType: SpaceType,
    spaceId: string
  ): Promise<number> {
    let count = 0;
    for (const [key, record] of this.documents) {
      if (record.spaceType === spaceType && record.spaceId === spaceId) {
        this.documents.delete(key);
        this.updates.delete(key);
        this.histories.delete(key);
        count += 1;
      }
    }
    return count;
  }

  async setLifecycle(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    lifecycle: DocLifecycle,
    timestamp: number
  ): Promise<void> {
    const key = docKey(spaceType, spaceId, docId);
    const current = this.documents.get(key);
    if (!current) {
      return;
    }
    this.documents.set(key, { ...current, lifecycle, timestamp });
  }

  async compactDocument(input: {
    spaceType: SpaceType;
    spaceId: string;
    docId: string;
    snapshot: Uint8Array;
    timestamp: number;
  }): Promise<void> {
    const key = docKey(input.spaceType, input.spaceId, input.docId);
    const current = this.documents.get(key);
    if (!current) {
      return;
    }
    this.documents.set(key, {
      ...current,
      snapshot: Uint8Array.from(input.snapshot),
      timestamp: input.timestamp,
      updateCount: 0,
    });
    this.updates.set(key, []);
  }

  async saveHistory(record: DocHistoryRecord): Promise<void> {
    const key = docKey(record.spaceType, record.spaceId, record.docId);
    const list = this.histories.get(key) ?? [];
    const stored: DocHistoryRecord = {
      ...record,
      snapshot: Uint8Array.from(record.snapshot),
    };
    const index = list.findIndex(item => item.timestamp === record.timestamp);
    if (index >= 0) {
      list[index] = stored;
    } else {
      list.push(stored);
    }
    this.histories.set(key, list);
  }

  async listHistories(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    opts?: { take?: number; before?: number }
  ): Promise<DocHistoryRecord[]> {
    const list = (this.histories.get(docKey(spaceType, spaceId, docId)) ?? [])
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter(item =>
        opts?.before === undefined ? true : item.timestamp < opts.before
      );
    const taken = opts?.take !== undefined ? list.slice(0, opts.take) : list;
    return taken.map(item => ({
      ...item,
      snapshot: Uint8Array.from(item.snapshot),
    }));
  }

  async getHistory(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    timestamp: number
  ): Promise<DocHistoryRecord | null> {
    const item = (
      this.histories.get(docKey(spaceType, spaceId, docId)) ?? []
    ).find(entry => entry.timestamp === timestamp);
    return item ? { ...item, snapshot: Uint8Array.from(item.snapshot) } : null;
  }

  async trimHistories(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    keep: number
  ): Promise<void> {
    const key = docKey(spaceType, spaceId, docId);
    const list = (this.histories.get(key) ?? [])
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, keep);
    this.histories.set(key, list);
  }

  async getBlob(workspaceId: string, key: string): Promise<StoredBlob | null> {
    const blob = this.blobs.get(`${workspaceId}\0${key}`);
    return blob ? { ...blob } : null;
  }

  async upsertBlob(record: StoredBlob): Promise<StoredBlob> {
    this.blobs.set(`${record.workspaceId}\0${record.key}`, { ...record });
    return { ...record };
  }

  async listBlobs(
    workspaceId: string,
    opts?: { includeDeleted?: boolean }
  ): Promise<StoredBlob[]> {
    const result: StoredBlob[] = [];
    for (const blob of this.blobs.values()) {
      if (blob.workspaceId !== workspaceId) {
        continue;
      }
      if (!opts?.includeDeleted && blob.deletedAt) {
        continue;
      }
      result.push({ ...blob });
    }
    return result.sort((a, b) => a.key.localeCompare(b.key));
  }

  async markBlobDeleted(
    workspaceId: string,
    key: string,
    at: Date
  ): Promise<boolean> {
    const current = this.blobs.get(`${workspaceId}\0${key}`);
    if (!current) {
      return false;
    }
    this.blobs.set(`${workspaceId}\0${key}`, { ...current, deletedAt: at });
    return true;
  }

  async deleteBlob(workspaceId: string, key: string): Promise<boolean> {
    return this.blobs.delete(`${workspaceId}\0${key}`);
  }

  async deleteWorkspaceBlobs(workspaceId: string): Promise<string[]> {
    const keys: string[] = [];
    for (const [mapKey, blob] of this.blobs) {
      if (blob.workspaceId === workspaceId) {
        keys.push(blob.key);
        this.blobs.delete(mapKey);
      }
    }
    for (const [id, session] of this.uploads) {
      if (session.workspaceId === workspaceId) {
        this.uploads.delete(id);
        this.uploadParts.delete(id);
      }
    }
    return keys;
  }

  async usedStorage(workspaceId: string): Promise<number> {
    let total = 0;
    for (const blob of this.blobs.values()) {
      if (blob.workspaceId === workspaceId && !blob.deletedAt) {
        total += blob.size;
      }
    }
    return total;
  }

  async createUpload(session: BlobUploadSession): Promise<BlobUploadSession> {
    this.uploads.set(session.id, { ...session });
    this.uploadParts.set(session.id, []);
    return { ...session };
  }

  async getUpload(uploadId: string): Promise<BlobUploadSession | null> {
    const session = this.uploads.get(uploadId);
    return session ? { ...session } : null;
  }

  async getUploadByToken(token: string): Promise<BlobUploadSession | null> {
    for (const session of this.uploads.values()) {
      if (session.token === token) {
        return { ...session };
      }
    }
    return null;
  }

  async findUpload(
    workspaceId: string,
    key: string
  ): Promise<BlobUploadSession | null> {
    let latest: BlobUploadSession | null = null;
    for (const session of this.uploads.values()) {
      if (session.workspaceId === workspaceId && session.key === key) {
        if (!latest || session.createdAt > latest.createdAt) {
          latest = session;
        }
      }
    }
    return latest ? { ...latest } : null;
  }

  async deleteUpload(uploadId: string): Promise<void> {
    this.uploads.delete(uploadId);
    this.uploadParts.delete(uploadId);
  }

  async putPart(part: BlobUploadPart): Promise<BlobUploadPart> {
    const list = this.uploadParts.get(part.uploadId) ?? [];
    const index = list.findIndex(item => item.partNumber === part.partNumber);
    if (index >= 0) {
      list[index] = { ...part };
    } else {
      list.push({ ...part });
    }
    this.uploadParts.set(part.uploadId, list);
    return { ...part };
  }

  async getPartByToken(token: string): Promise<BlobUploadPart | null> {
    for (const list of this.uploadParts.values()) {
      const part = list.find(item => item.token === token);
      if (part) {
        return { ...part };
      }
    }
    return null;
  }

  async listParts(uploadId: string): Promise<BlobUploadPart[]> {
    return (this.uploadParts.get(uploadId) ?? []).map(part => ({ ...part }));
  }

  async updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
    const current = this.workspaces.get(id);
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
    this.workspaces.set(id, next);
    return { ...next };
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return (this.members.get(workspaceId) ?? []).map(member => ({ ...member }));
  }

  async countMembers(workspaceId: string): Promise<number> {
    return this.members.get(workspaceId)?.length ?? 0;
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const list = this.members.get(workspaceId);
    if (!list) {
      return false;
    }
    const next = list.filter(member => member.userId !== userId);
    this.members.set(workspaceId, next);
    return next.length !== list.length;
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<void> {
    const list = this.members.get(workspaceId);
    const member = list?.find(item => item.userId === userId);
    if (!member) {
      throw errors.memberNotFoundInSpace(workspaceId);
    }
    member.role = role;
  }

  async createInvitation(
    invite: WorkspaceInvitation
  ): Promise<WorkspaceInvitation> {
    this.invitations.set(invite.id, { ...invite });
    return { ...invite };
  }

  async getInvitation(id: string): Promise<WorkspaceInvitation | null> {
    const invite = this.invitations.get(id);
    return invite ? { ...invite } : null;
  }

  async findInvitationByEmail(
    workspaceId: string,
    email: string
  ): Promise<WorkspaceInvitation | null> {
    for (const invite of this.invitations.values()) {
      if (invite.workspaceId === workspaceId && invite.email === email) {
        return { ...invite };
      }
    }
    return null;
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    return [...this.invitations.values()]
      .filter(invite => invite.workspaceId === workspaceId)
      .map(invite => ({ ...invite }));
  }

  async updateInvitation(
    id: string,
    patch: Partial<
      Pick<WorkspaceInvitation, 'status' | 'inviteeId' | 'acceptedAt'>
    >
  ): Promise<WorkspaceInvitation> {
    const current = this.invitations.get(id);
    if (!current) {
      throw errors.invalidInvitation();
    }
    const next = { ...current, ...patch };
    this.invitations.set(id, next);
    return { ...next };
  }

  async deleteInvitation(id: string): Promise<void> {
    this.invitations.delete(id);
  }

  async upsertInviteLink(
    link: WorkspaceInviteLink
  ): Promise<WorkspaceInviteLink> {
    this.inviteLinks.set(link.workspaceId, { ...link });
    return { ...link };
  }

  async getInviteLink(
    workspaceId: string
  ): Promise<WorkspaceInviteLink | null> {
    const link = this.inviteLinks.get(workspaceId);
    return link ? { ...link } : null;
  }

  async getInviteLinkByToken(
    token: string
  ): Promise<WorkspaceInviteLink | null> {
    for (const link of this.inviteLinks.values()) {
      if (link.token === token) {
        return { ...link };
      }
    }
    return null;
  }

  async deleteInviteLink(workspaceId: string): Promise<boolean> {
    return this.inviteLinks.delete(workspaceId);
  }

  async publishDoc(doc: PublicDoc): Promise<PublicDoc> {
    this.publicDocs.set(publicDocKey(doc.workspaceId, doc.docId), { ...doc });
    return { ...doc };
  }

  async getPublicDoc(
    workspaceId: string,
    docId: string
  ): Promise<PublicDoc | null> {
    const doc = this.publicDocs.get(publicDocKey(workspaceId, docId));
    return doc ? { ...doc } : null;
  }

  async listPublicDocs(workspaceId: string): Promise<PublicDoc[]> {
    return [...this.publicDocs.values()]
      .filter(doc => doc.workspaceId === workspaceId)
      .map(doc => ({ ...doc }));
  }

  async revokePublicDoc(
    workspaceId: string,
    docId: string
  ): Promise<PublicDoc | null> {
    const key = publicDocKey(workspaceId, docId);
    const existing = this.publicDocs.get(key);
    this.publicDocs.delete(key);
    return existing ? { ...existing } : null;
  }

  async createComment(comment: CommentRecord): Promise<CommentRecord> {
    this.comments.set(comment.id, { ...comment });
    return { ...comment };
  }

  async getComment(id: string): Promise<CommentRecord | null> {
    const comment = this.comments.get(id);
    return comment ? { ...comment } : null;
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
    const all = [...this.comments.values()]
      .filter(
        comment =>
          comment.workspaceId === workspaceId && comment.docId === docId
      )
      .sort(byCreatedThenId);
    return paginate(all, pagination);
  }

  async updateComment(
    id: string,
    patch: Partial<Pick<CommentRecord, 'content' | 'resolved' | 'updatedAt'>>
  ): Promise<CommentRecord> {
    const current = this.comments.get(id);
    if (!current) {
      throw errors.commentNotFound();
    }
    const next = { ...current, ...patch };
    this.comments.set(id, next);
    return { ...next };
  }

  async deleteComment(id: string): Promise<boolean> {
    for (const [replyId, reply] of this.replies) {
      if (reply.commentId === id) {
        this.replies.delete(replyId);
      }
    }
    return this.comments.delete(id);
  }

  async createReply(reply: CommentReplyRecord): Promise<CommentReplyRecord> {
    this.replies.set(reply.id, { ...reply });
    return { ...reply };
  }

  async getReply(id: string): Promise<CommentReplyRecord | null> {
    const reply = this.replies.get(id);
    return reply ? { ...reply } : null;
  }

  async listReplies(commentId: string): Promise<CommentReplyRecord[]> {
    return [...this.replies.values()]
      .filter(reply => reply.commentId === commentId)
      .sort(byCreatedThenId)
      .map(reply => ({ ...reply }));
  }

  async listRepliesForComments(
    commentIds: string[]
  ): Promise<CommentReplyRecord[]> {
    const set = new Set(commentIds);
    return [...this.replies.values()]
      .filter(reply => set.has(reply.commentId))
      .map(reply => ({ ...reply }));
  }

  async updateReply(
    id: string,
    patch: Partial<Pick<CommentReplyRecord, 'content' | 'updatedAt'>>
  ): Promise<CommentReplyRecord> {
    const current = this.replies.get(id);
    if (!current) {
      throw errors.commentNotFound();
    }
    const next = { ...current, ...patch };
    this.replies.set(id, next);
    return { ...next };
  }

  async deleteReply(id: string): Promise<boolean> {
    return this.replies.delete(id);
  }

  async appendCommentChange(
    change: Omit<CommentChangeRecord, 'id'>
  ): Promise<CommentChangeRecord> {
    this.commentChangeSeq += 1;
    const record: CommentChangeRecord = {
      ...change,
      id: String(this.commentChangeSeq),
    };
    this.commentChanges.push(record);
    return { ...record };
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
    const all = this.commentChanges
      .filter(
        change => change.workspaceId === workspaceId && change.docId === docId
      )
      .sort(byCreatedThenId);
    return paginate(all, pagination);
  }

  async linkOauthAccount(account: OauthAccount): Promise<OauthAccount> {
    this.oauthAccounts.set(`${account.provider}:${account.providerAccountId}`, {
      ...account,
    });
    return { ...account };
  }

  async findOauthAccount(
    provider: string,
    providerAccountId: string
  ): Promise<OauthAccount | null> {
    const account = this.oauthAccounts.get(`${provider}:${providerAccountId}`);
    return account ? { ...account } : null;
  }

  async listOauthProviders(userId: string): Promise<string[]> {
    return [
      ...new Set(
        [...this.oauthAccounts.values()]
          .filter(account => account.userId === userId)
          .map(account => account.provider)
      ),
    ];
  }

  async appendAudit(event: AuditEvent): Promise<AuditEvent> {
    const saved: AuditEvent = {
      ...event,
      metadata: { ...event.metadata },
      createdAt: new Date(event.createdAt),
    };
    this.auditEvents.push(saved);
    return { ...saved, metadata: { ...saved.metadata } };
  }

  async listAudit(query: AuditQuery): Promise<AuditEvent[]> {
    return this.auditEvents
      .filter(event => {
        if (query.workspaceId && event.workspaceId !== query.workspaceId) {
          return false;
        }
        if (query.actorId && event.actorId !== query.actorId) {
          return false;
        }
        if (query.action && event.action !== query.action) {
          return false;
        }
        if (query.after && event.createdAt.getTime() <= query.after.getTime()) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, query.take ?? 100)
      .map(event => ({
        ...event,
        metadata: { ...event.metadata },
        createdAt: new Date(event.createdAt),
      }));
  }

  async getSecurityPolicy(
    workspaceId: string | null
  ): Promise<SecurityPolicy | null> {
    const policy = this.securityPolicies.get(workspaceId ?? '');
    return policy
      ? {
          ...policy,
          allowedGuestDomains: [...policy.allowedGuestDomains],
          requireSsoDomains: [...policy.requireSsoDomains],
        }
      : null;
  }

  async upsertSecurityPolicy(policy: SecurityPolicy): Promise<SecurityPolicy> {
    const saved: SecurityPolicy = {
      ...policy,
      allowedGuestDomains: [...policy.allowedGuestDomains],
      requireSsoDomains: [...policy.requireSsoDomains],
      updatedAt: new Date(policy.updatedAt),
    };
    this.securityPolicies.set(policy.workspaceId ?? '', saved);
    return {
      ...saved,
      allowedGuestDomains: [...saved.allowedGuestDomains],
      requireSsoDomains: [...saved.requireSsoDomains],
    };
  }

  async createWebhook(hook: WorkspaceWebhook): Promise<WorkspaceWebhook> {
    this.webhooks.set(hook.id, { ...hook, events: [...hook.events] });
    return { ...hook, events: [...hook.events] };
  }

  async getWebhook(id: string): Promise<WorkspaceWebhook | null> {
    const hook = this.webhooks.get(id);
    return hook ? { ...hook, events: [...hook.events] } : null;
  }

  async listWebhooks(workspaceId: string): Promise<WorkspaceWebhook[]> {
    return [...this.webhooks.values()]
      .filter(hook => hook.workspaceId === workspaceId)
      .map(hook => ({ ...hook, events: [...hook.events] }));
  }

  async deleteWebhook(id: string): Promise<boolean> {
    return this.webhooks.delete(id);
  }

  async createCopilotSession(
    session: CopilotSessionRecord
  ): Promise<CopilotSessionRecord> {
    this.copilotSessions.set(session.id, { ...session });
    this.copilotMessages.set(session.id, []);
    return { ...session };
  }

  async getCopilotSession(id: string): Promise<CopilotSessionRecord | null> {
    const session = this.copilotSessions.get(id);
    return session ? { ...session } : null;
  }

  async listCopilotSessions(
    userId: string,
    workspaceId: string
  ): Promise<CopilotSessionRecord[]> {
    return [...this.copilotSessions.values()]
      .filter(
        session =>
          session.userId === userId && session.workspaceId === workspaceId
      )
      .map(session => ({ ...session }));
  }

  async countCopilotSessions(userId: string): Promise<number> {
    return [...this.copilotSessions.values()].filter(
      session => session.userId === userId
    ).length;
  }

  async appendCopilotMessage(
    message: CopilotMessageRecord
  ): Promise<CopilotMessageRecord> {
    const list = this.copilotMessages.get(message.sessionId) ?? [];
    list.push({ ...message });
    this.copilotMessages.set(message.sessionId, list);
    return { ...message };
  }

  async listCopilotMessages(
    sessionId: string
  ): Promise<CopilotMessageRecord[]> {
    return (this.copilotMessages.get(sessionId) ?? []).map(message => ({
      ...message,
    }));
  }

  private findSession(
    predicate: (session: Session) => boolean
  ): Session | null {
    for (const session of this.sessions.values()) {
      if (predicate(session)) {
        return cloneSession(session);
      }
    }
    return null;
  }
}

function publicDocKey(workspaceId: string, docId: string): string {
  return `${workspaceId}:${docId}`;
}

function byCreatedThenId(
  a: { createdAt: Date; id: string },
  b: { createdAt: Date; id: string }
): number {
  const delta = a.createdAt.getTime() - b.createdAt.getTime();
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
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
  const items = all.slice(start, start + limit).map(item => ({ ...item }));
  return {
    items,
    totalCount: all.length,
    hasNextPage: start + items.length < all.length,
  };
}
