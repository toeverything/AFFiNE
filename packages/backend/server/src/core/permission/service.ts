import { Injectable } from '@nestjs/common';

import { DocActionDenied, SpaceAccessDenied } from '../../base';
import type {
  DocPreviewExposure,
  PermissionDecisionV1,
  PermissionDocRole,
  PermissionEvaluationOutputV1,
  PermissionWorkspaceRole,
} from '../../native';
import { BackendRuntimeProvider } from '../backend-runtime';
import { docLegacyBoundary, workspaceLegacyBoundary } from './context';
import {
  type DocAction,
  DocRole,
  type WorkspaceAction,
  WorkspaceRole,
} from './types';

export type PermissionWorkspaceAction = WorkspaceAction | 'Workspace.Preview';
export type PermissionDocAction = DocAction | 'Doc.Preview';
type PermissionResult<Role> = {
  effectiveRole: Role | null;
  legacyApiRole: DocRole | WorkspaceRole | null;
  decisions: PermissionDecisionV1[];
};

@Injectable()
export class PermissionService {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  async workspacePermissions(input: {
    userId?: string;
    workspaceId: string;
    actions: PermissionWorkspaceAction[];
  }): Promise<PermissionResult<PermissionWorkspaceRole>> {
    const output = await this.authorize({
      actorUserId: input.userId,
      workspaceId: input.workspaceId,
      workspaceActions: input.actions,
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
  }): Promise<PermissionResult<PermissionDocRole>> {
    const output = await this.authorize({
      actorUserId: input.userId,
      workspaceId: input.workspaceId,
      docs: [{ docId: input.docId, actions: input.actions }],
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
  }) {
    if (!(await this.canDoc(input))) {
      throw new DocActionDenied({
        action: input.action,
        docId: input.docId,
        spaceId: input.workspaceId,
      });
    }
  }

  async batchDocPermissions(input: {
    userId?: string;
    workspaceId: string;
    docs: Array<{ docId: string; actions: PermissionDocAction[] }>;
  }): Promise<Array<PermissionResult<PermissionDocRole> & { docId: string }>> {
    const output = await this.authorize({
      actorUserId: input.userId,
      workspaceId: input.workspaceId,
      docs: input.docs,
    });
    return output.docs.map(doc => ({
      docId: doc.docId,
      ...docLegacyBoundary(doc),
      decisions: doc.decisions,
    }));
  }

  async workspacePreviewExposure(input: {
    userId?: string;
    workspaceId: string;
  }): Promise<DocPreviewExposure> {
    const output = await this.authorize({
      actorUserId: input.userId,
      workspaceId: input.workspaceId,
      workspaceActions: ['Workspace.Preview'],
    });
    return output.workspace.previewExposure ?? 'denied';
  }

  async docPreviewExposure(input: {
    userId?: string;
    workspaceId: string;
    docId: string;
  }): Promise<DocPreviewExposure> {
    const output = await this.authorize({
      actorUserId: input.userId,
      workspaceId: input.workspaceId,
      docs: [{ docId: input.docId, actions: ['Doc.Preview'] }],
    });
    return output.docs[0]?.previewExposure ?? 'denied';
  }

  private async authorize(
    input: Omit<
      Parameters<BackendRuntimeProvider['authorizePermissionV1']>[0],
      'version'
    >
  ): Promise<PermissionEvaluationOutputV1> {
    return await this.runtime.authorizePermissionV1({
      version: 1,
      ...input,
    });
  }
}

export type PermissionServiceEvaluationOutput = PermissionEvaluationOutputV1;
