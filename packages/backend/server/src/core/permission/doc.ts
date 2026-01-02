import { Injectable } from '@nestjs/common';

import { DocActionDenied } from '../../base';
import { Models } from '../../models';
import { AccessController, getAccessController } from './controller';
import type { Resource } from './resource';
import {
  DocAction,
  docActionRequiredRole,
  DocRole,
  mapDocRoleToPermissions,
} from './types';
import { WorkspaceAccessController } from './workspace';

@Injectable()
export class DocAccessController extends AccessController<'doc'> {
  protected readonly type = 'doc';
  constructor(private readonly models: Models) {
    super();
  }

  async role(resource: Resource<'doc'>) {
    const role = await this.getRole(resource);
    const permissions = mapDocRoleToPermissions(role);
    const sharingAllowed = await this.models.workspace.allowSharing(
      resource.workspaceId
    );
    if (!sharingAllowed) {
      permissions['Doc.Publish'] = false;
    }

    return { role, permissions };
  }

  async can(resource: Resource<'doc'>, action: DocAction) {
    const { permissions, role } = await this.role(resource);
    const allow = permissions[action] || false;

    if (!allow) {
      this.logger.debug('Doc access check failed', {
        action,
        resource,
        role,
        requiredRole: docActionRequiredRole(action),
      });
    }

    return allow;
  }

  async assert(resource: Resource<'doc'>, action: DocAction) {
    const allow = await this.can(resource, action);

    if (!allow) {
      throw new DocActionDenied({
        docId: resource.docId,
        spaceId: resource.workspaceId,
        action,
      });
    }
  }

  async getRole(payload: Resource<'doc'>): Promise<DocRole | null> {
    const workspaceController = getAccessController(
      'ws'
    ) as WorkspaceAccessController;
    const docRoles = await workspaceController.getDocRoles(payload, [
      payload.docId,
    ]);
    return docRoles[0];
  }
}
