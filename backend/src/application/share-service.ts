import { errors } from '../domain/errors.js';
import type { User } from '../domain/identity.js';
import type {
  Clock,
  RealtimeHub,
  ShareStore,
  WorkspaceStore,
} from '../domain/ports.js';
import {
  isPublicDocMode,
  type PublicDoc,
  type PublicDocMode,
} from '../domain/share.js';
import { WorkspaceService } from './workspace-service.js';
import type { AuditService } from './audit-service.js';
import type { SecurityPolicyService } from './security-policy-service.js';
import type { WebhookService } from './webhook-service.js';

export class ShareService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly workspaceStore: WorkspaceStore,
    private readonly shares: ShareStore,
    private readonly clock: Clock,
    private readonly hub?: RealtimeHub,
    private readonly extras: {
      audit?: AuditService;
      policy?: SecurityPolicyService;
      webhooks?: WebhookService;
    } = {}
  ) {}

  async publish(
    user: User,
    workspaceId: string,
    docId: string,
    mode?: string | null
  ): Promise<PublicDoc> {
    await this.workspaces.requireAdmin(user, workspaceId);
    const workspace = await this.workspaceStore.getWorkspace(workspaceId);
    if (!workspace?.enableSharing) {
      throw errors.actionForbidden('Workspace sharing is disabled.');
    }
    await this.extras.policy?.assertPublicLinksAllowed(workspaceId);
    const resolved: PublicDocMode = isPublicDocMode(mode) ? mode : 'Page';
    const doc = await this.shares.publishDoc({
      workspaceId,
      docId,
      mode: resolved,
      publishedAt: this.clock.now(),
      publishedBy: user.id,
    });
    this.emitShare(workspaceId, docId);
    await this.extras.audit?.record({
      workspaceId,
      actorId: user.id,
      action: 'share.publish',
      targetType: 'doc',
      targetId: docId,
    });
    await this.extras.webhooks?.emit(workspaceId, 'share.published', {
      docId,
      mode: resolved,
    });
    return doc;
  }

  async revoke(
    user: User,
    workspaceId: string,
    docId: string
  ): Promise<PublicDoc> {
    await this.workspaces.requireAdmin(user, workspaceId);
    const existing = await this.shares.getPublicDoc(workspaceId, docId);
    const revoked = await this.shares.revokePublicDoc(workspaceId, docId);
    this.emitShare(workspaceId, docId);
    await this.extras.audit?.record({
      workspaceId,
      actorId: user.id,
      action: 'share.revoke',
      targetType: 'doc',
      targetId: docId,
    });
    await this.extras.webhooks?.emit(workspaceId, 'share.revoked', { docId });
    return (
      revoked ??
      existing ?? {
        workspaceId,
        docId,
        mode: 'Page',
        publishedAt: this.clock.now(),
        publishedBy: user.id,
      }
    );
  }

  async get(
    user: User,
    workspaceId: string,
    docId: string
  ): Promise<PublicDoc | null> {
    await this.workspaces.requireMember(user, workspaceId);
    return this.shares.getPublicDoc(workspaceId, docId);
  }

  async list(user: User, workspaceId: string): Promise<PublicDoc[]> {
    await this.workspaces.requireMember(user, workspaceId);
    return this.shares.listPublicDocs(workspaceId);
  }

  async publicDoc(workspaceId: string, docId: string): Promise<PublicDoc> {
    const workspace = await this.workspaceStore.getWorkspace(workspaceId);
    if (!workspace) {
      throw errors.spaceNotFound();
    }
    const doc = await this.shares.getPublicDoc(workspaceId, docId);
    if (!doc) {
      throw errors.docNotFound();
    }
    return doc;
  }

  shareState(doc: PublicDoc | null) {
    if (!doc) {
      return null;
    }
    return {
      public: true,
      mode: doc.mode,
      defaultRole: 'Reader',
    };
  }

  private emitShare(workspaceId: string, docId: string): void {
    this.hub?.emit(
      'doc.share-state.changed',
      { workspaceId, docId },
      { changed: true, reason: 'updated' }
    );
  }
}
