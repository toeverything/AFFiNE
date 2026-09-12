import type { AuditEvent, AuditQuery } from './audit.js';
import type { CopilotMessageRecord, CopilotSessionRecord } from './ai.js';
import type {
  BlobUploadPart,
  BlobUploadSession,
  DocHistoryRecord,
  StoredBlob,
} from './blob.js';
import type {
  CommentChangeRecord,
  CommentRecord,
  CommentReplyRecord,
  Pagination,
} from './comment.js';
import type {
  DocumentRecord,
  DocLifecycle,
  SpaceType,
  StoredDocUpdate,
} from './doc.js';
import type {
  Credential,
  Session,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from './identity.js';
import type {
  WorkspaceInvitation,
  WorkspaceInviteLink,
  WorkspacePatch,
} from './membership.js';
import type { OauthAccount } from './sso.js';
import type { SecurityPolicy } from './security.js';
import type { PublicDoc } from './share.js';
import type { WorkspaceWebhook } from './webhook.js';

export type HttpFetcher = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export interface Clock {
  now(): Date;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface IdentityStore {
  countUsers(): Promise<number>;
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  createUser(user: User, passwordHash: string | null): Promise<User>;
  updateUser(
    id: string,
    patch: Partial<
      Pick<User, 'name' | 'avatarUrl' | 'emailVerified' | 'features'>
    >
  ): Promise<User>;
  getCredential(userId: string): Promise<Credential | null>;

  createSession(session: Session): Promise<Session>;
  findSessionById(id: string): Promise<Session | null>;
  findSessionByTokenHash(hash: string): Promise<Session | null>;
  findSessionByAccessHash(hash: string): Promise<Session | null>;
  findSessionByRefreshHash(hash: string): Promise<Session | null>;
  findSessionByExchangeHash(hash: string): Promise<Session | null>;
  listSessionsByUser(userId: string): Promise<Session[]>;
  updateSession(id: string, patch: Partial<Session>): Promise<Session>;
  revokeSession(id: string, at: Date): Promise<void>;
  revokeOtherSessions(
    userId: string,
    exceptId: string,
    at: Date
  ): Promise<number>;
  revokeAllSessions(userId: string, at: Date): Promise<number>;
}

export interface WorkspaceStore {
  createWorkspace(workspace: Workspace, ownerId: string): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | null>;
  listWorkspacesForUser(userId: string): Promise<Workspace[]>;
  deleteWorkspace(id: string): Promise<boolean>;
  updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace>;
  getMember(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMember | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  countMembers(workspaceId: string): Promise<number>;
  getOwner(workspaceId: string): Promise<User | null>;
  addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    at: Date,
    inviteId?: string
  ): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<boolean>;
  updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<void>;
}

export interface MembershipStore {
  createInvitation(invite: WorkspaceInvitation): Promise<WorkspaceInvitation>;
  getInvitation(id: string): Promise<WorkspaceInvitation | null>;
  findInvitationByEmail(
    workspaceId: string,
    email: string
  ): Promise<WorkspaceInvitation | null>;
  listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]>;
  updateInvitation(
    id: string,
    patch: Partial<
      Pick<WorkspaceInvitation, 'status' | 'inviteeId' | 'acceptedAt'>
    >
  ): Promise<WorkspaceInvitation>;
  deleteInvitation(id: string): Promise<void>;
  upsertInviteLink(link: WorkspaceInviteLink): Promise<WorkspaceInviteLink>;
  getInviteLink(workspaceId: string): Promise<WorkspaceInviteLink | null>;
  getInviteLinkByToken(token: string): Promise<WorkspaceInviteLink | null>;
  deleteInviteLink(workspaceId: string): Promise<boolean>;
}

export interface ShareStore {
  publishDoc(doc: PublicDoc): Promise<PublicDoc>;
  getPublicDoc(workspaceId: string, docId: string): Promise<PublicDoc | null>;
  listPublicDocs(workspaceId: string): Promise<PublicDoc[]>;
  revokePublicDoc(
    workspaceId: string,
    docId: string
  ): Promise<PublicDoc | null>;
}

export interface CommentStore {
  createComment(comment: CommentRecord): Promise<CommentRecord>;
  getComment(id: string): Promise<CommentRecord | null>;
  listComments(
    workspaceId: string,
    docId: string,
    pagination?: Pagination
  ): Promise<{
    items: CommentRecord[];
    totalCount: number;
    hasNextPage: boolean;
  }>;
  updateComment(
    id: string,
    patch: Partial<Pick<CommentRecord, 'content' | 'resolved' | 'updatedAt'>>
  ): Promise<CommentRecord>;
  deleteComment(id: string): Promise<boolean>;
  createReply(reply: CommentReplyRecord): Promise<CommentReplyRecord>;
  getReply(id: string): Promise<CommentReplyRecord | null>;
  listReplies(commentId: string): Promise<CommentReplyRecord[]>;
  listRepliesForComments(commentIds: string[]): Promise<CommentReplyRecord[]>;
  updateReply(
    id: string,
    patch: Partial<Pick<CommentReplyRecord, 'content' | 'updatedAt'>>
  ): Promise<CommentReplyRecord>;
  deleteReply(id: string): Promise<boolean>;
  appendCommentChange(
    change: Omit<CommentChangeRecord, 'id'>
  ): Promise<CommentChangeRecord>;
  listCommentChanges(
    workspaceId: string,
    docId: string,
    pagination?: Pagination
  ): Promise<{
    items: CommentChangeRecord[];
    totalCount: number;
    hasNextPage: boolean;
  }>;
}

export interface DocStore {
  getDocument(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<DocumentRecord | null>;
  upsertDocument(record: DocumentRecord): Promise<DocumentRecord>;
  appendUpdate(input: {
    spaceType: SpaceType;
    spaceId: string;
    docId: string;
    clock: number;
    payload: Uint8Array;
    payloadHash: string;
  }): Promise<{ clock: number; duplicate: boolean }>;
  listUpdates(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<StoredDocUpdate[]>;
  listTimestamps(
    spaceType: SpaceType,
    spaceId: string,
    after?: number
  ): Promise<Record<string, number>>;
  deleteDocument(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<boolean>;
  deleteSpaceDocuments(spaceType: SpaceType, spaceId: string): Promise<number>;
  setLifecycle(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    lifecycle: DocLifecycle,
    timestamp: number
  ): Promise<void>;
  compactDocument(input: {
    spaceType: SpaceType;
    spaceId: string;
    docId: string;
    snapshot: Uint8Array;
    timestamp: number;
  }): Promise<void>;
  saveHistory(record: DocHistoryRecord): Promise<void>;
  listHistories(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    opts?: { take?: number; before?: number }
  ): Promise<DocHistoryRecord[]>;
  getHistory(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    timestamp: number
  ): Promise<DocHistoryRecord | null>;
  trimHistories(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    keep: number
  ): Promise<void>;
}

export interface BlobStore {
  getBlob(workspaceId: string, key: string): Promise<StoredBlob | null>;
  upsertBlob(record: StoredBlob): Promise<StoredBlob>;
  listBlobs(
    workspaceId: string,
    opts?: { includeDeleted?: boolean }
  ): Promise<StoredBlob[]>;
  markBlobDeleted(workspaceId: string, key: string, at: Date): Promise<boolean>;
  deleteBlob(workspaceId: string, key: string): Promise<boolean>;
  deleteWorkspaceBlobs(workspaceId: string): Promise<string[]>;
  usedStorage(workspaceId: string): Promise<number>;
  createUpload(session: BlobUploadSession): Promise<BlobUploadSession>;
  getUpload(uploadId: string): Promise<BlobUploadSession | null>;
  getUploadByToken(token: string): Promise<BlobUploadSession | null>;
  findUpload(
    workspaceId: string,
    key: string
  ): Promise<BlobUploadSession | null>;
  deleteUpload(uploadId: string): Promise<void>;
  putPart(part: BlobUploadPart): Promise<BlobUploadPart>;
  getPartByToken(token: string): Promise<BlobUploadPart | null>;
  listParts(uploadId: string): Promise<BlobUploadPart[]>;
}

export interface BlobObjectStore {
  put(objectKey: string, bytes: Uint8Array): Promise<void>;
  get(objectKey: string): Promise<Uint8Array | null>;
  delete(objectKey: string): Promise<void>;
  close(): Promise<void>;
}

export interface OauthAccountStore {
  linkOauthAccount(account: OauthAccount): Promise<OauthAccount>;
  findOauthAccount(
    provider: string,
    providerAccountId: string
  ): Promise<OauthAccount | null>;
  listOauthProviders(userId: string): Promise<string[]>;
}

export interface AuditStore {
  appendAudit(event: AuditEvent): Promise<AuditEvent>;
  listAudit(query: AuditQuery): Promise<AuditEvent[]>;
}

export interface SecurityPolicyStore {
  getSecurityPolicy(workspaceId: string | null): Promise<SecurityPolicy | null>;
  upsertSecurityPolicy(policy: SecurityPolicy): Promise<SecurityPolicy>;
}

export interface WebhookStore {
  createWebhook(hook: WorkspaceWebhook): Promise<WorkspaceWebhook>;
  getWebhook(id: string): Promise<WorkspaceWebhook | null>;
  listWebhooks(workspaceId: string): Promise<WorkspaceWebhook[]>;
  deleteWebhook(id: string): Promise<boolean>;
}

export interface AiStore {
  createCopilotSession(
    session: CopilotSessionRecord
  ): Promise<CopilotSessionRecord>;
  getCopilotSession(id: string): Promise<CopilotSessionRecord | null>;
  listCopilotSessions(
    userId: string,
    workspaceId: string
  ): Promise<CopilotSessionRecord[]>;
  countCopilotSessions(userId: string): Promise<number>;
  appendCopilotMessage(
    message: CopilotMessageRecord
  ): Promise<CopilotMessageRecord>;
  listCopilotMessages(sessionId: string): Promise<CopilotMessageRecord[]>;
}

export interface HealthProbe {
  kind: 'memory' | 'postgres';
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export interface RealtimeHub {
  emit(topic: string, input: Record<string, unknown>, event: unknown): void;
}

export interface MosaicStore
  extends
    IdentityStore,
    WorkspaceStore,
    DocStore,
    BlobStore,
    MembershipStore,
    ShareStore,
    CommentStore,
    OauthAccountStore,
    AuditStore,
    SecurityPolicyStore,
    WebhookStore,
    AiStore,
    HealthProbe {}
