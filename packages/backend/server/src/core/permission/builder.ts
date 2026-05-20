import { Injectable } from '@nestjs/common';

import { DocID } from '../utils/doc';
import { Resource } from './resource';
import { PermissionService } from './service';
import {
  DOC_ACTIONS,
  DocAction,
  DocRole,
  WORKSPACE_ACTIONS,
  WorkspaceAction,
  WorkspaceRole,
} from './types';

function assertPerm(permission?: PermissionService) {
  if (!permission) {
    throw new Error('PermissionService is required for permission checks.');
  }
  return permission;
}

@Injectable()
export class AccessControllerBuilder {
  constructor(private readonly permission?: PermissionService) {}

  user(userId: string) {
    return new UserAccessControllerBuilder(userId, this.permission);
  }
}

export class UserAccessControllerBuilder {
  constructor(
    private readonly userId: string,
    private readonly permission?: PermissionService
  ) {}

  workspace(workspaceId: string) {
    return new WorkspaceAccessControllerBuilder(
      {
        userId: this.userId,
        workspaceId,
      },
      this.permission
    );
  }

  doc(
    docId: DocID | { workspaceId: string; docId: string }
  ): DocAccessControllerBuilder;
  doc(workspaceId: string, docId: string): DocAccessControllerBuilder;
  doc(
    docIdOrWorkspaceId: string | DocID | { workspaceId: string; docId: string },
    doc?: string
  ) {
    let workspaceId: string;
    let docId: string;

    if (docIdOrWorkspaceId instanceof DocID) {
      workspaceId = docIdOrWorkspaceId.workspace;
      docId = docIdOrWorkspaceId.guid;
    } else if (typeof docIdOrWorkspaceId === 'string') {
      workspaceId = docIdOrWorkspaceId;
      docId = doc as string;
    } else {
      workspaceId = docIdOrWorkspaceId.workspaceId;
      docId = docIdOrWorkspaceId.docId;
    }

    return new DocAccessControllerBuilder(
      {
        userId: this.userId,
        workspaceId,
        docId,
      },
      this.permission
    );
  }
}

class WorkspaceAccessControllerBuilder {
  constructor(
    public readonly data: Resource<'ws'>,
    private readonly permission?: PermissionService
  ) {}

  allowLocal() {
    this.data.allowLocal = true;
    return this;
  }

  doc(docId: string) {
    return new DocAccessControllerBuilder(
      {
        ...this.data,
        docId,
      },
      this.permission
    );
  }

  /**
   * Filter items by doc access permission
   * @param items - items to filter
   * @param action - action to check
   * @returns filtered items
   */
  async docs<T extends { docId: string }>(
    items: T[],
    action: DocAction
  ): Promise<T[]> {
    const docIds = items.map(item => item.docId);
    const docRoles = await assertPerm(this.permission).batchDocPermissions({
      userId: this.data.userId,
      workspaceId: this.data.workspaceId,
      docs: docIds.map(docId => ({
        docId,
        actions: [action],
      })),
      allowLocal: this.data.allowLocal,
    });
    const docRolesMap = new Map(
      docRoles.map((role, index) => [docIds[index], role])
    );

    return items.filter(item => {
      return docRolesMap
        .get(item.docId)
        ?.decisions.some(
          decision => decision.action === action && decision.allowed
        );
    });
  }

  async assert(action: WorkspaceAction) {
    await assertPerm(this.permission).assertWorkspace({
      ...this.data,
      action,
    });
  }

  async can(action: WorkspaceAction) {
    return await assertPerm(this.permission).canWorkspace({
      ...this.data,
      action,
    });
  }

  async permissions() {
    const result = await assertPerm(this.permission).workspacePermissions({
      ...this.data,
      actions: [...WORKSPACE_ACTIONS],
    });
    return {
      role: result.legacyApiRole as WorkspaceRole | null,
      permissions: Object.fromEntries(
        result.decisions.map(decision => [decision.action, decision.allowed])
      ) as Record<WorkspaceAction, boolean>,
    };
  }
}

class DocAccessControllerBuilder {
  constructor(
    public readonly data: Resource<'doc'>,
    private readonly permission?: PermissionService
  ) {}

  allowLocal() {
    this.data.allowLocal = true;
    return this;
  }

  async assert(action: DocAction) {
    await assertPerm(this.permission).assertDoc({
      ...this.data,
      action,
    });
  }

  async can(action: DocAction) {
    return await assertPerm(this.permission).canDoc({
      ...this.data,
      action,
    });
  }

  async permissions() {
    const result = await assertPerm(this.permission).docPermissions({
      ...this.data,
      actions: [...DOC_ACTIONS],
    });
    return {
      role: result.legacyApiRole as DocRole | null,
      permissions: Object.fromEntries(
        result.decisions.map(decision => [decision.action, decision.allowed])
      ) as Record<DocAction, boolean>,
    };
  }
}
