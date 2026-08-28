import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import type { PermissionEvaluationInputV1 } from '../../native';
import type { DocAction, WorkspaceAction } from './types';

type PermissionRequestCache = {
  workspaceQuotaRuntime: Map<string, WorkspaceRuntimeState>;
};

type WorkspaceMemberRow = {
  role: 'owner' | 'admin' | 'member';
  state: 'active' | 'suspended' | 'left';
};

type WorkspacePolicyRow = {
  visibility: 'private' | 'public';
  sharingEnabled: boolean;
  urlPreviewEnabled: boolean;
  memberDefaultDocRole: 'none' | 'reader' | 'commenter' | 'editor' | 'manager';
};

type DocPolicyRow = {
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

type DocGrantRow = {
  docId: string;
  role: 'owner' | 'manager' | 'editor' | 'commenter' | 'reader';
};

type WorkspaceRuntimeState = {
  known: boolean;
  stale: boolean;
  readonly: boolean;
  readonlyReasons: string[];
  staleAfter: Date | null;
};

const CACHE_KEY = 'permission.context.cache';

function createPermissionRequestCache(): PermissionRequestCache {
  return {
    workspaceQuotaRuntime: new Map(),
  };
}

export type PermissionWorkspaceAction = WorkspaceAction | 'Workspace.Preview';
export type PermissionDocAction = DocAction | 'Doc.Preview';

@Injectable()
export class PermissionContextLoader {
  constructor(
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
    const docIds = docs.map(doc => doc.docId);
    const [member, workspacePolicy, runtime, docPolicies, docGrants] =
      await Promise.all([
        input.userId
          ? this.workspaceMember(input.workspaceId, input.userId)
          : Promise.resolve(null),
        this.workspacePolicy(input.workspaceId),
        this.workspaceRuntime(input.workspaceId),
        this.docPolicies(input.workspaceId, docIds),
        input.userId
          ? this.docGrants(input.workspaceId, docIds, input.userId)
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

  invalidateWorkspaceQuotaRuntime(workspaceId: string) {
    this.cache.workspaceQuotaRuntime.delete(workspaceId);
  }

  private workspaceRuntime(workspaceId: string) {
    return this.memo(
      this.cache.workspaceQuotaRuntime,
      workspaceId,
      async () => {
        const rows = await this.db.$queryRaw<WorkspaceRuntimeState[]>`
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

  private async workspaceMember(workspaceId: string, userId: string) {
    const rows = await this.db.$queryRaw<WorkspaceMemberRow[]>`
      SELECT role, state
      FROM workspace_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ${userId}
        AND state = 'active'
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async workspacePolicy(workspaceId: string) {
    const rows = await this.db.$queryRaw<WorkspacePolicyRow[]>`
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

  private async docPolicies(workspaceId: string, docIds: string[]) {
    if (docIds.length === 0) {
      return [];
    }
    return await this.db.$queryRaw<DocPolicyRow[]>`
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

  private async docGrants(
    workspaceId: string,
    docIds: string[],
    userId: string
  ) {
    if (docIds.length === 0) {
      return [];
    }
    return await this.db.$queryRaw<DocGrantRow[]>`
      SELECT doc_id AS "docId", role
      FROM doc_grants
      WHERE workspace_id = ${workspaceId}
        AND principal_type = 'user'
        AND principal_id = ${userId}
        AND doc_id = ANY(${[...new Set(docIds)]})
    `;
  }
}
