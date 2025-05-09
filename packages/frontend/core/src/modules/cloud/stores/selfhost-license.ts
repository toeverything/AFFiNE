import {
  activateLicenseMutation,
  deactivateLicenseMutation,
  getLicenseQuery,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../services/workspace-server';

export class SelfhostLicenseStore extends Store {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  async getLicense(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: getLicenseQuery,
      variables: {
        workspaceId: workspaceId,
      },
      context: {
        signal,
      },
    });

    return data.workspace.license;
  }

  async activate(workspaceId: string, license: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: activateLicenseMutation,
      variables: {
        workspaceId: workspaceId,
        license: license,
      },
      context: {
        signal,
      },
    });

    return data.activateLicense;
  }

  async deactivate(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: deactivateLicenseMutation,
      variables: {
        workspaceId: workspaceId,
      },
      context: {
        signal,
      },
    });

    return data.deactivateLicense;
  }
}
