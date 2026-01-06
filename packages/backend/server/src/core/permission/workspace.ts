import { Injectable } from '@nestjs/common';

import { SpaceAccessDenied } from '../../base';
import { DocRole, Models } from '../../models';
import { AccessController } from './controller';
import type { Resource } from './resource';
import {
  fixupDocRole,
  mapDocRoleToPermissions,
  mapWorkspaceRoleToPermissions,
  WorkspaceAction,
  workspaceActionRequiredRole,
  WorkspaceRole,
} from './types';

@Injectable()
export class WorkspaceAccessController extends AccessController<'ws'> {
  protected readonly type = 'ws';

  constructor(private readonly models: Models) {
    super();
  }

  async role(resource: Resource<'ws'>) {
    let role = await this.getRole(resource);

    // NOTE(@forehalo): special case for public page
    // Currently, we can not only load binary of a public Doc to render in a shared page,
    // so we need to ensure anyone has basic 'read' permission to a workspace that has public pages.
    if (
      !role &&
      (await this.models.workspace.allowSharing(resource.workspaceId)) &&
      (await this.models.doc.hasPublic(resource.workspaceId))
    ) {
      role = WorkspaceRole.External;
    }

    return {
      role,
      permissions: mapWorkspaceRoleToPermissions(role),
    };
  }

  async can(resource: Resource<'ws'>, action: WorkspaceAction) {
    const { permissions, role } = await this.role(resource);
    const allow = permissions[action] || false;

    if (!allow) {
      this.logger.debug('Workspace access check failed', {
        action,
        resource,
        role,
        requiredRole: workspaceActionRequiredRole(action),
      });
    }

    return allow;
  }

  async assert(resource: Resource<'ws'>, action: WorkspaceAction) {
    const allow = await this.can(resource, action);

    if (!allow) {
      throw new SpaceAccessDenied({ spaceId: resource.workspaceId });
    }
  }

  async getRole(payload: Resource<'ws'>) {
    const userRole = await this.models.workspaceUser.getActive(
      payload.workspaceId,
      payload.userId
    );

    let role = userRole?.type as WorkspaceRole | null;

    if (!role) {
      role = await this.defaultWorkspaceRole(payload);
    }

    return role;
  }

  async docRoles(payload: Resource<'ws'>, docIds: string[]) {
    const docRoles = await this.getDocRoles(payload, docIds);
    return docRoles.map(role => ({
      role,
      permissions: mapDocRoleToPermissions(role),
    }));
  }

  async getDocRoles(payload: Resource<'ws'>, docIds: string[]) {
    const docRoles: (DocRole | null)[] = [];

    if (docIds.length === 0) {
      return docRoles;
    }

    const workspaceRole = await this.getRole(payload);
    const sharingAllowed = await this.models.workspace.allowSharing(
      payload.workspaceId
    );
    if (
      !sharingAllowed &&
      (workspaceRole === null || workspaceRole === WorkspaceRole.External)
    ) {
      return docIds.map(() => null);
    }

    const userRoles = await this.models.docUser.findMany(
      payload.workspaceId,
      docIds,
      payload.userId
    );
    const userRolesMap = new Map(userRoles.map(role => [role.docId, role]));

    const noUserRoleDocIds = docIds.filter(docId => {
      const userRole = userRolesMap.get(docId);
      return (userRole?.type ?? null) === null;
    });
    const defaultDocRoles =
      noUserRoleDocIds.length > 0
        ? await this.getDocDefaultRoles(
            payload,
            noUserRoleDocIds,
            workspaceRole
          )
        : [];
    const defaultDocRolesMap = new Map(
      defaultDocRoles.map((role, index) => [noUserRoleDocIds[index], role])
    );

    for (const docId of docIds) {
      const userRole = userRolesMap.get(docId);

      let docRole: DocRole | null = userRole?.type ?? null;

      // fallback logic
      if (docRole === null) {
        docRole = defaultDocRolesMap.get(docId) ?? null;
      }

      // we need to fixup doc role to make sure it's not miss set
      // for example: workspace owner will have doc owner role
      //              workspace external will not have role higher than editor
      const role = fixupDocRole(workspaceRole, docRole);

      // never return [None]
      docRoles.push(role === DocRole.None ? null : role);
    }

    return docRoles;
  }

  private async getDocDefaultRoles(
    payload: Resource<'ws'>,
    docIds: string[],
    workspaceRole: WorkspaceRole | null
  ) {
    const fallbackDocRoles: (DocRole | null)[] = [];

    if (docIds.length === 0) {
      return fallbackDocRoles;
    }

    const defaultDocRoles = await this.models.doc.findDefaultRoles(
      payload.workspaceId,
      docIds
    );

    for (const defaultDocRole of defaultDocRoles) {
      let docRole: DocRole | null;
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

      fallbackDocRoles.push(docRole);
    }

    return fallbackDocRoles;
  }

  private async defaultWorkspaceRole(payload: Resource<'ws'>) {
    const ws = await this.models.workspace.get(payload.workspaceId);

    // NOTE(@forehalo):
    //   we allow user to use online service with local workspace
    //   so we always return owner role for local workspace
    //   copilot session for local workspace is an example
    if (!ws) {
      if (payload.allowLocal) {
        return WorkspaceRole.Owner;
      }

      return null;
    }

    if (ws.public) {
      const sharingAllowed = await this.models.workspace.allowSharing(ws.id);
      return sharingAllowed ? WorkspaceRole.External : null;
    }

    return null;
  }
}
