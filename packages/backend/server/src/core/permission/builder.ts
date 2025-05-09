import { Injectable } from '@nestjs/common';

import { DocID } from '../utils/doc';
import { getAccessController } from './controller';
import { Resource } from './resource';
import { DocAction, WorkspaceAction } from './types';

@Injectable()
export class AccessControllerBuilder {
  user(userId: string) {
    return new UserAccessControllerBuilder(userId);
  }
}

export class UserAccessControllerBuilder {
  constructor(private readonly userId: string) {}

  workspace(workspaceId: string) {
    return new WorkspaceAccessControllerBuilder({
      userId: this.userId,
      workspaceId,
    });
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

    return new DocAccessControllerBuilder({
      userId: this.userId,
      workspaceId,
      docId,
    });
  }
}

class WorkspaceAccessControllerBuilder {
  constructor(public readonly data: Resource<'ws'>) {}

  allowLocal() {
    this.data.allowLocal = true;
    return this;
  }

  doc(docId: string) {
    return new DocAccessControllerBuilder({
      ...this.data,
      docId,
    });
  }

  async assert(action: WorkspaceAction) {
    const checker = getAccessController('ws');
    await checker.assert(this.data, action);
  }

  async can(action: WorkspaceAction) {
    const checker = getAccessController('ws');
    return await checker.can(this.data, action);
  }

  async permissions() {
    const checker = getAccessController('ws');
    return await checker.role(this.data);
  }
}

class DocAccessControllerBuilder {
  constructor(public readonly data: Resource<'doc'>) {}

  allowLocal() {
    this.data.allowLocal = true;
    return this;
  }

  async assert(action: DocAction) {
    const checker = getAccessController('doc');
    await checker.assert(this.data, action);
  }

  async can(action: DocAction) {
    const checker = getAccessController('doc');
    return await checker.can(this.data, action);
  }

  async permissions() {
    const checker = getAccessController('doc');
    return await checker.role(this.data);
  }
}
