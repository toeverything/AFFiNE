import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  DocActionDenied,
  InternalServerError,
  SpaceAccessDenied,
} from '../../base';
import {
  evaluatePermissionV1,
  type PermissionEvaluationInputV1,
  type PermissionEvaluationOutputV1,
} from '../../native';
import { docLegacyBoundary, workspaceLegacyBoundary } from './context';
import {
  PermissionContextLoader,
  type PermissionDocAction,
  type PermissionWorkspaceAction,
} from './context-loader';
import { WorkspacePolicyService } from './policy';
import { PermissionSqlPredicateBuilder } from './sql-predicate';
import type { DocAction } from './types';

const RUNTIME_RESTRICTED_WORKSPACE_ACTIONS = new Set<PermissionWorkspaceAction>(
  [
    'Workspace.Sync',
    'Workspace.CreateDoc',
    'Workspace.Delete',
    'Workspace.TransferOwner',
    'Workspace.Users.Manage',
    'Workspace.Administrators.Manage',
    'Workspace.Settings.Update',
    'Workspace.Properties.Create',
    'Workspace.Properties.Update',
    'Workspace.Properties.Delete',
    'Workspace.Blobs.Write',
    'Workspace.Payment.Manage',
  ]
);

const RUNTIME_RESTRICTED_DOC_ACTIONS = new Set<PermissionDocAction>([
  'Doc.Duplicate',
  'Doc.Trash',
  'Doc.Restore',
  'Doc.Delete',
  'Doc.Update',
  'Doc.Publish',
  'Doc.TransferOwner',
  'Doc.Properties.Update',
  'Doc.Users.Manage',
  'Doc.Comments.Create',
  'Doc.Comments.Update',
  'Doc.Comments.Delete',
  'Doc.Comments.Resolve',
]);

@Injectable()
export class PermissionService {
  constructor(
    private readonly loader: PermissionContextLoader,
    @Optional()
    @Inject(PermissionSqlPredicateBuilder)
    private readonly sqlPredicate = new PermissionSqlPredicateBuilder(),
    @Optional()
    private readonly workspacePolicy?: WorkspacePolicyService
  ) {}

  docReadableSqlPredicate(input: {
    userId: string;
    workspaceId: string;
    action: DocAction;
    docIdColumn?: Prisma.Sql;
  }) {
    return this.sqlPredicate.docReadableSql(input);
  }

  evaluate(input: PermissionEvaluationInputV1) {
    try {
      return evaluatePermissionV1(input);
    } catch (error) {
      throw new InternalServerError(
        error instanceof Error ? error.message : undefined
      );
    }
  }

  async workspacePermissions(input: {
    userId?: string;
    workspaceId: string;
    actions: PermissionWorkspaceAction[];
    allowLocal?: boolean;
  }) {
    const output = await this.evaluateLoaded({
      userId: input.userId,
      workspaceId: input.workspaceId,
      workspaceActions: input.actions,
      allowLocal: input.allowLocal,
    });
    return {
      ...workspaceLegacyBoundary(output.workspace),
      decisions: output.workspace.decisions,
    };
  }

  async canWorkspace(input: {
    userId?: string;
    workspaceId: string;
    action: PermissionWorkspaceAction;
    allowLocal?: boolean;
  }) {
    const output = await this.workspacePermissions({
      ...input,
      actions: [input.action],
    });
    return output.decisions[0]?.allowed ?? false;
  }

  async assertWorkspace(input: {
    userId?: string;
    workspaceId: string;
    action: PermissionWorkspaceAction;
    allowLocal?: boolean;
  }) {
    if (!(await this.canWorkspace(input))) {
      throw new SpaceAccessDenied({ spaceId: input.workspaceId });
    }
  }

  async docPermissions(input: {
    userId?: string;
    workspaceId: string;
    docId: string;
    actions: PermissionDocAction[];
    allowLocal?: boolean;
  }) {
    const output = await this.evaluateLoaded({
      userId: input.userId,
      workspaceId: input.workspaceId,
      docs: [{ docId: input.docId, actions: input.actions }],
      allowLocal: input.allowLocal,
    });
    const doc = output.docs[0];
    return {
      ...docLegacyBoundary(doc),
      decisions: doc.decisions,
    };
  }

  async canDoc(input: {
    userId?: string;
    workspaceId: string;
    docId: string;
    action: PermissionDocAction;
    allowLocal?: boolean;
  }) {
    const output = await this.docPermissions({
      ...input,
      actions: [input.action],
    });
    return output.decisions[0]?.allowed ?? false;
  }

  async assertDoc(input: {
    userId?: string;
    workspaceId: string;
    docId: string;
    action: PermissionDocAction;
    allowLocal?: boolean;
  }) {
    if (!(await this.canDoc(input))) {
      throw new DocActionDenied({
        action: input.action,
        docId: input.docId,
        spaceId: input.workspaceId,
      });
    }
  }

  async filterReadableDocs<T extends { docId: string }>(input: {
    userId?: string;
    workspaceId: string;
    docs: T[];
    allowLocal?: boolean;
  }) {
    const decisions = await this.batchDocPermissions({
      ...input,
      docs: input.docs.map(doc => ({
        docId: doc.docId,
        actions: ['Doc.Read'],
      })),
    });
    const readableDocIds = new Set(
      decisions.filter(doc => doc.decisions[0]?.allowed).map(doc => doc.docId)
    );
    return input.docs.filter(doc => readableDocIds.has(doc.docId));
  }

  async batchDocPermissions(input: {
    userId?: string;
    workspaceId: string;
    docs: Array<{ docId: string; actions: PermissionDocAction[] }>;
    allowLocal?: boolean;
  }) {
    const output = await this.evaluateLoaded(input);
    return output.docs.map(doc => ({
      docId: doc.docId,
      ...docLegacyBoundary(doc),
      decisions: doc.decisions,
    }));
  }

  async canPreviewWorkspace(input: {
    userId?: string;
    workspaceId: string;
    allowLocal?: boolean;
  }) {
    return await this.canWorkspace({
      ...input,
      action: 'Workspace.Preview',
    });
  }

  async canPreviewDoc(input: {
    userId?: string;
    workspaceId: string;
    docId: string;
    allowLocal?: boolean;
  }) {
    return await this.canDoc({
      ...input,
      action: 'Doc.Preview',
    });
  }

  private async evaluateLoaded(
    input: Parameters<PermissionContextLoader['load']>[0]
  ) {
    try {
      if (
        this.needsFreshRuntimeState(input) &&
        (await this.loader.workspaceExists(input.workspaceId))
      ) {
        await this.workspacePolicy?.getWorkspaceState(input.workspaceId);
        this.loader.invalidateWorkspaceQuotaRuntime(input.workspaceId);
      }
      return this.evaluate(await this.loader.load(input));
    } catch (error) {
      if (
        input.allowLocal &&
        error instanceof Error &&
        error.message === 'Workspace owner not found'
      ) {
        const loaded = await this.loader.load(input);
        if (loaded.workspace?.local) {
          return this.evaluate(loaded);
        }
      }
      throw error;
    }
  }

  private needsFreshRuntimeState(
    input: Parameters<PermissionContextLoader['load']>[0]
  ) {
    return (
      input.workspaceActions?.some(action =>
        RUNTIME_RESTRICTED_WORKSPACE_ACTIONS.has(action)
      ) ||
      input.docs?.some(doc =>
        doc.actions.some(action => RUNTIME_RESTRICTED_DOC_ACTIONS.has(action))
      ) ||
      false
    );
  }
}

export type PermissionServiceEvaluationOutput = PermissionEvaluationOutputV1;
