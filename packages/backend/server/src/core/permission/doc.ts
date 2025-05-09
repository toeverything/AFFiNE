import { Injectable } from '@nestjs/common';

import { DocActionDenied } from '../../base';
import { Models } from '../../models';
import { AccessController, getAccessController } from './controller';
import type { Resource } from './resource';
import {
  DocAction,
  docActionRequiredRole,
  DocRole,
  fixupDocRole,
  mapDocRoleToPermissions,
  WorkspaceRole,
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

    return {
      role,
      permissions: mapDocRoleToPermissions(role),
    };
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
    const workspaceRole = await workspaceController.getRole(payload);

    const userRole = await this.models.docUser.get(
      payload.workspaceId,
      payload.docId,
      payload.userId
    );

    let docRole = userRole?.type ?? (null as DocRole | null);

    // fallback logic
    if (docRole === null) {
      const defaultDocRole = await this.defaultDocRole(
        payload.workspaceId,
        payload.docId
      );

      // if user is in workspace but doc role is not set, fallback to default doc role
      if (workspaceRole !== null && workspaceRole !== WorkspaceRole.External) {
        docRole =
          defaultDocRole.external !== null
            ? // edgecase: when doc role set to [None] for workspace member, but doc is public, we should fallback to external role
              Math.max(defaultDocRole.workspace, defaultDocRole.external)
            : defaultDocRole.workspace;
      } else {
        // else fallback to external doc role
        docRole = defaultDocRole.external;
      }
    }

    // we need to fixup doc role to make sure it's not miss set
    // for example: workspace owner will have doc owner role
    //              workspace external will not have role higher than editor
    const role = fixupDocRole(workspaceRole, docRole);

    // never return [None]
    return role === DocRole.None ? null : role;
  }

  private async defaultDocRole(workspaceId: string, docId: string) {
    const doc = await this.models.doc.getMeta(workspaceId, docId, {
      select: {
        public: true,
        defaultRole: true,
      },
    });
    return {
      external: doc?.public ? DocRole.External : null,
      workspace: doc?.defaultRole ?? DocRole.Manager,
    };
  }
}
