import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { DocRole, Models } from '../../models';
import type { PermissionEvaluationInputV1 } from '../../native';
import {
  toNativeDocRole,
  toNativeExplicitDocGrantRole,
  toNativeMemberState,
  toNativeWorkspaceRole,
} from './context';
import type { DocAction, WorkspaceAction } from './types';

type PermissionRequestCache = {
  workspaceMember: Map<
    string,
    Awaited<ReturnType<Models['workspaceUser']['get']>>
  >;
  workspacePolicy: Map<string, Awaited<ReturnType<Models['workspace']['get']>>>;
  workspaceRuntime: Map<
    string,
    Awaited<ReturnType<Models['workspaceRuntimeState']['get']>>
  >;
  workspaceQuotaRuntime: Map<string, NewWorkspaceRuntimeState>;
  docPolicies: Map<
    string,
    Awaited<ReturnType<Models['doc']['findDefaultRoles']>>
  >;
  docGrants: Map<string, Awaited<ReturnType<Models['docUser']['findMany']>>>;
};

type NewWorkspaceMemberRow = {
  role: 'owner' | 'admin' | 'member';
  state: 'active' | 'suspended' | 'left';
};

type NewWorkspacePolicyRow = {
  visibility: 'private' | 'public';
  sharingEnabled: boolean;
  urlPreviewEnabled: boolean;
  memberDefaultDocRole: 'none' | 'reader' | 'commenter' | 'editor' | 'manager';
};

type NewDocPolicyRow = {
  docId: string;
  visibility: 'private' | 'public';
  publicRole: 'external' | null;
  memberDefaultRole:
    | 'none'
    | 'reader'
    | 'commenter'
    | 'editor'
    | 'manager'
    | null;
  urlPreviewEnabled: boolean;
};

type NewDocGrantRow = {
  docId: string;
  role: 'owner' | 'manager' | 'editor' | 'commenter' | 'reader';
};

type NewWorkspaceRuntimeState = {
  known: boolean;
  stale: boolean;
  readonly: boolean;
  readonlyReasons: string[];
  staleAfter: Date | null;
};

const CACHE_KEY = 'permission.context.cache';

function createPermissionRequestCache(): PermissionRequestCache {
  return {
    workspaceMember: new Map(),
    workspacePolicy: new Map(),
    workspaceRuntime: new Map(),
    workspaceQuotaRuntime: new Map(),
    docPolicies: new Map(),
    docGrants: new Map(),
  };
}

export type PermissionWorkspaceAction = WorkspaceAction | 'Workspace.Preview';
export type PermissionDocAction = DocAction | 'Doc.Preview';

function cacheKey(parts: readonly unknown[]) {
  return parts.join('\0');
}

@Injectable()
export class PermissionContextLoader {
  constructor(
    private readonly models: Models,
    private readonly db: PrismaClient,
    private readonly cls?: ClsService
  ) {}

  async load(input: {
    userId?: string;
    workspaceId: string;
    allowLocal?: boolean;
    workspaceActions?: PermissionWorkspaceAction[];
    docs?: Array<{ docId: string; actions: PermissionDocAction[] }>;
  }): Promise<PermissionEvaluationInputV1> {
    const docs = input.docs ?? [];
    const [member, workspace, runtime, docPolicies, docGrants] =
      await Promise.all([
        input.userId
          ? this.workspaceMember(input.workspaceId, input.userId)
          : Promise.resolve(null),
        this.workspacePolicy(input.workspaceId),
        this.workspaceRuntime(input.workspaceId),
        this.docPolicies(
          input.workspaceId,
          docs.map(doc => doc.docId)
        ),
        input.userId
          ? this.docGrants(
              input.workspaceId,
              docs.map(doc => doc.docId),
              input.userId
            )
          : Promise.resolve([]),
      ]);

    const docGrantMap = new Map(docGrants.map(grant => [grant.docId, grant]));
    const workspaceSharingEnabled = workspace?.enableSharing ?? true;

    return {
      version: 1,
      legacyCompatMode: true,
      subject: {
        userId: input.userId,
        groupIds: [],
        allowLocal: input.allowLocal,
      },
      runtime: {
        known: runtime.known,
        stale: runtime.stale,
        readonly: runtime.readonly,
        readonlyReason: runtime.readonlyReasons[0],
        sharingEnabled: workspaceSharingEnabled,
        urlPreviewEnabled: workspace?.enableUrlPreview ?? false,
      },
      workspace: {
        role: toNativeWorkspaceRole(member?.type),
        memberState: toNativeMemberState(member?.status),
        public: workspace?.public ?? false,
        sharingEnabled: workspaceSharingEnabled,
        urlPreviewEnabled: workspace?.enableUrlPreview ?? false,
        local: !workspace,
      },
      workspaceActions: input.workspaceActions,
      docs: docs.map((doc, index) => {
        const policy = docPolicies[index];
        const grant = docGrantMap.get(doc.docId);
        return {
          docId: doc.docId,
          actions: doc.actions,
          explicitUserRole: toNativeExplicitDocGrantRole(grant?.type),
          groupGrants: [],
          groupGrantsEnabled: false,
          memberDefaultRole: toNativeDocRole(
            policy?.workspace ?? DocRole.Manager
          ),
          publicRole: policy?.external === null ? undefined : 'external',
          visibility: policy?.external === null ? 'private' : 'public',
          sharingEnabled: workspaceSharingEnabled,
          previewEnabled: policy?.external !== null,
        };
      }),
    };
  }

  async loadFromNewTables(input: {
    userId?: string;
    workspaceId: string;
    allowLocal?: boolean;
    workspaceActions?: PermissionWorkspaceAction[];
    docs?: Array<{ docId: string; actions: PermissionDocAction[] }>;
  }): Promise<PermissionEvaluationInputV1> {
    const docs = input.docs ?? [];
    const docIds = docs.map(doc => doc.docId);
    const [member, workspacePolicy, runtime, docPolicies, docGrants] =
      await Promise.all([
        input.userId
          ? this.newWorkspaceMember(input.workspaceId, input.userId)
          : Promise.resolve(null),
        this.newWorkspacePolicy(input.workspaceId),
        this.newWorkspaceRuntime(input.workspaceId),
        this.newDocPolicies(input.workspaceId, docIds),
        input.userId
          ? this.newDocGrants(input.workspaceId, docIds, input.userId)
          : Promise.resolve([]),
      ]);
    const docPolicyMap = new Map(
      docPolicies.map(policy => [policy.docId, policy])
    );
    const docGrantMap = new Map(docGrants.map(grant => [grant.docId, grant]));
    const local =
      !workspacePolicy &&
      !!input.allowLocal &&
      !(await this.workspaceExists(input.workspaceId));
    const sharingEnabled = workspacePolicy?.sharingEnabled ?? true;
    const urlPreviewEnabled = workspacePolicy?.urlPreviewEnabled ?? false;

    return {
      version: 1,
      legacyCompatMode: true,
      subject: {
        userId: input.userId,
        groupIds: [],
        allowLocal: input.allowLocal,
      },
      runtime: {
        known: runtime.known,
        stale: runtime.stale,
        readonly: runtime.readonly,
        readonlyReason: runtime.readonlyReasons[0],
        sharingEnabled,
        urlPreviewEnabled,
      },
      workspace: {
        role: member?.role,
        memberState: member?.state === 'active' ? 'active' : undefined,
        public: workspacePolicy?.visibility === 'public',
        sharingEnabled,
        urlPreviewEnabled,
        local,
      },
      workspaceActions: input.workspaceActions,
      docs: docs.map(doc => {
        const policy = docPolicyMap.get(doc.docId);
        const grant = docGrantMap.get(doc.docId);
        const visibility = policy?.visibility ?? 'private';
        const publicRole = policy?.publicRole ?? undefined;
        return {
          docId: doc.docId,
          actions: doc.actions,
          explicitUserRole: grant?.role,
          groupGrants: [],
          groupGrantsEnabled: false,
          memberDefaultRole:
            policy?.memberDefaultRole ??
            workspacePolicy?.memberDefaultDocRole ??
            'manager',
          publicRole: publicRole === 'external' ? 'external' : undefined,
          visibility,
          sharingEnabled,
          previewEnabled:
            visibility === 'public' ||
            policy?.urlPreviewEnabled ||
            urlPreviewEnabled,
        };
      }),
    };
  }

  private get cache(): PermissionRequestCache {
    if (!this.cls) {
      return createPermissionRequestCache();
    }

    if (typeof this.cls.isActive === 'function' && !this.cls.isActive()) {
      return createPermissionRequestCache();
    }

    const existing = this.cls.get(CACHE_KEY) as
      | PermissionRequestCache
      | undefined;
    if (existing) {
      return existing;
    }

    const created = createPermissionRequestCache();
    this.cls.set(CACHE_KEY, created);
    return created;
  }

  private memo<T>(
    map: Map<string, Promise<T> | T>,
    key: string,
    load: () => Promise<T>
  ) {
    const cached = map.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }
    const promise = load();
    map.set(key, promise);
    return promise;
  }

  private workspaceMember(workspaceId: string, userId: string) {
    return this.memo(
      this.cache.workspaceMember,
      cacheKey([workspaceId, userId]),
      () => this.models.workspaceUser.get(workspaceId, userId)
    );
  }

  private workspacePolicy(workspaceId: string) {
    return this.memo(this.cache.workspacePolicy, workspaceId, () =>
      this.models.workspace.get(workspaceId)
    );
  }

  private async workspaceRuntime(workspaceId: string) {
    return this.memo(this.cache.workspaceRuntime, workspaceId, () =>
      this.models.workspaceRuntimeState.get(workspaceId).then(async state => {
        if (state.known || !state.stale) {
          return state;
        }

        const quotaState = await this.newWorkspaceRuntime(workspaceId);
        if (!quotaState.known) {
          return state;
        }

        return {
          workspaceId,
          known: quotaState.known,
          stale: quotaState.stale,
          readonly: quotaState.readonly,
          readonlyReasons: quotaState.readonlyReasons,
          updatedAt: null,
          lastReconciledAt: null,
          staleAfter: quotaState.staleAfter,
        };
      })
    );
  }

  invalidateWorkspaceQuotaRuntime(workspaceId: string) {
    this.cache.workspaceQuotaRuntime.delete(workspaceId);
  }

  private newWorkspaceRuntime(workspaceId: string) {
    return this.memo(
      this.cache.workspaceQuotaRuntime,
      workspaceId,
      async () => {
        const rows = await this.db.$queryRaw<NewWorkspaceRuntimeState[]>`
        SELECT
          known,
          stale,
          readonly,
          readonly_reasons AS "readonlyReasons",
          stale_after AS "staleAfter"
        FROM effective_workspace_quota_states
        WHERE workspace_id = ${workspaceId}
        LIMIT 1
      `;
        const state = rows[0];
        if (!state) {
          return {
            known: false,
            stale: true,
            readonly: false,
            readonlyReasons: [],
            staleAfter: null,
          };
        }

        return {
          ...state,
          stale:
            state.stale ||
            (state.staleAfter !== null && state.staleAfter <= new Date()),
        };
      }
    );
  }

  private docPolicies(workspaceId: string, docIds: string[]) {
    const uniqueDocIds = [...new Set(docIds)];
    return this.memo(
      this.cache.docPolicies,
      cacheKey([workspaceId, ...uniqueDocIds]),
      () => this.models.doc.findDefaultRoles(workspaceId, uniqueDocIds)
    );
  }

  private docGrants(workspaceId: string, docIds: string[], userId: string) {
    const uniqueDocIds = [...new Set(docIds)];
    return this.memo(
      this.cache.docGrants,
      cacheKey([workspaceId, userId, ...uniqueDocIds]),
      () => this.models.docUser.findMany(workspaceId, uniqueDocIds, userId)
    );
  }

  private async newWorkspaceMember(workspaceId: string, userId: string) {
    const rows = await this.db.$queryRaw<NewWorkspaceMemberRow[]>`
      SELECT role, state
      FROM workspace_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ${userId}
        AND state = 'active'
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async newWorkspacePolicy(workspaceId: string) {
    const rows = await this.db.$queryRaw<NewWorkspacePolicyRow[]>`
      SELECT
        visibility,
        sharing_enabled AS "sharingEnabled",
        url_preview_enabled AS "urlPreviewEnabled",
        member_default_doc_role AS "memberDefaultDocRole"
      FROM workspace_access_policies
      WHERE workspace_id = ${workspaceId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async workspaceExists(workspaceId: string) {
    const workspace = await this.db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    return !!workspace;
  }

  private async newDocPolicies(workspaceId: string, docIds: string[]) {
    if (docIds.length === 0) {
      return [];
    }
    return await this.db.$queryRaw<NewDocPolicyRow[]>`
      SELECT
        doc_id AS "docId",
        visibility,
        public_role AS "publicRole",
        member_default_role AS "memberDefaultRole",
        url_preview_enabled AS "urlPreviewEnabled"
      FROM doc_access_policies
      WHERE workspace_id = ${workspaceId}
        AND doc_id = ANY(${[...new Set(docIds)]})
    `;
  }

  private async newDocGrants(
    workspaceId: string,
    docIds: string[],
    userId: string
  ) {
    if (docIds.length === 0) {
      return [];
    }
    return await this.db.$queryRaw<NewDocGrantRow[]>`
      SELECT doc_id AS "docId", role
      FROM doc_grants
      WHERE workspace_id = ${workspaceId}
        AND principal_type = 'user'
        AND principal_id = ${userId}
        AND doc_id = ANY(${[...new Set(docIds)]})
    `;
  }
}
