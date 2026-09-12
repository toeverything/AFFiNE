import { errors } from '../domain/errors.js';
import type { User, Workspace, WorkspaceMember } from '../domain/identity.js';
import type { WorkspacePatch } from '../domain/membership.js';
import type { Clock, WorkspaceStore } from '../domain/ports.js';
import type { AuditService } from './audit-service.js';

export interface WorkspaceJanitor {
  purgeWorkspace(workspaceId: string): Promise<void>;
}

export class WorkspaceService {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly clock: Clock,
    private readonly janitor?: WorkspaceJanitor,
    private readonly audit?: AuditService
  ) {}

  async list(user: User | null): Promise<Workspace[]> {
    if (!user) {
      return [];
    }
    return this.store.listWorkspacesForUser(user.id);
  }

  async get(user: User, workspaceId: string): Promise<Workspace> {
    await this.requireMember(user, workspaceId);
    const workspace = await this.store.getWorkspace(workspaceId);
    if (!workspace) {
      throw errors.spaceNotFound();
    }
    return workspace;
  }

  async requireMember(
    user: User,
    workspaceId: string
  ): Promise<WorkspaceMember> {
    const workspace = await this.store.getWorkspace(workspaceId);
    if (!workspace) {
      throw errors.spaceNotFound();
    }
    const member = await this.store.getMember(workspaceId, user.id);
    if (!member) {
      throw errors.spaceAccessDenied(workspaceId);
    }
    return member;
  }

  async requireAdmin(
    user: User,
    workspaceId: string
  ): Promise<WorkspaceMember> {
    const member = await this.requireMember(user, workspaceId);
    if (member.role !== 'owner' && member.role !== 'admin') {
      throw errors.spaceAccessDenied(workspaceId);
    }
    return member;
  }

  async create(user: User): Promise<Workspace> {
    const now = this.clock.now();
    const workspace = await this.store.createWorkspace(
      {
        id: crypto.randomUUID(),
        name: 'Untitled',
        isPublic: false,
        initialized: true,
        team: false,
        enableSharing: true,
        enableUrlPreview: false,
        enableAi: false,
        createdAt: now,
        createdBy: user.id,
      },
      user.id
    );
    await this.audit?.record({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'workspace.create',
      targetType: 'workspace',
      targetId: workspace.id,
    });
    return workspace;
  }

  async delete(user: User, workspaceId: string): Promise<boolean> {
    const workspace = await this.store.getWorkspace(workspaceId);
    if (!workspace) {
      throw errors.spaceNotFound();
    }
    const member = await this.store.getMember(workspaceId, user.id);
    if (!member || member.role !== 'owner') {
      throw errors.spaceAccessDenied(workspaceId);
    }
    await this.janitor?.purgeWorkspace(workspaceId);
    const deleted = await this.store.deleteWorkspace(workspaceId);
    if (deleted) {
      await this.audit?.record({
        workspaceId,
        actorId: user.id,
        action: 'workspace.delete',
        targetType: 'workspace',
        targetId: workspaceId,
      });
    }
    return deleted;
  }

  async ownerOf(workspaceId: string): Promise<User | null> {
    return this.store.getOwner(workspaceId);
  }

  async update(
    user: User,
    workspaceId: string,
    patch: WorkspacePatch
  ): Promise<Workspace> {
    await this.requireAdmin(user, workspaceId);
    return this.store.updateWorkspace(workspaceId, patch);
  }

  async memberCount(workspaceId: string): Promise<number> {
    return this.store.countMembers(workspaceId);
  }
}
