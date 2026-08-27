import type { Server } from '@affine/core/modules/cloud';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';

import type { PendingShareItem, ShareLinkPreview } from './types';

const LINK_PREVIEW_PATH = '/api/worker/link-preview';
const OFFICIAL_LINK_PREVIEW_ENDPOINT = `https://app.affine.pro${LINK_PREVIEW_PATH}`;

export class SharePreviewRouteOwner {
  private endpoint: string | undefined;
  private inFlight:
    | {
        endpoint: string;
        controller: AbortController;
        request: Promise<ShareLinkPreview>;
      }
    | undefined;
  private selectedWorkspaceKey: string | undefined;

  constructor(private readonly item: PendingShareItem) {
    this.selectedWorkspaceKey = undefined;
  }

  get routeEndpoint() {
    return this.endpoint;
  }

  selectWorkspace(workspace: WorkspaceMetadata | undefined, servers: Server[]) {
    if (this.item.previewRoute === 'official') {
      this.endpoint ??= OFFICIAL_LINK_PREVIEW_ENDPOINT;
      return;
    }
    if (!workspace || workspace.flavour === 'local') {
      this.setEndpoint(
        undefined,
        workspace ? `${workspace.flavour}:${workspace.id}` : undefined
      );
      return;
    }
    const workspaceKey = `${workspace.flavour}:${workspace.id}`;
    if (this.selectedWorkspaceKey === workspaceKey && this.endpoint) return;
    const server = servers.find(server => server.id === workspace.flavour);
    const type = server?.config$.value?.type;
    const endpoint =
      server && type === ServerDeploymentType.Selfhosted
        ? new URL(LINK_PREVIEW_PATH, server.baseUrl).toString()
        : type === ServerDeploymentType.Affine
          ? OFFICIAL_LINK_PREVIEW_ENDPOINT
          : undefined;
    this.setEndpoint(endpoint, workspaceKey);
  }

  load(signal?: AbortSignal): Promise<ShareLinkPreview> | undefined {
    const url = this.item.content.url;
    if (!url || !this.endpoint) return undefined;
    if (
      this.inFlight?.endpoint === this.endpoint &&
      !this.inFlight.controller.signal.aborted
    ) {
      return this.inFlight.request;
    }
    const endpoint = this.endpoint;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener('abort', abort, { once: true });
    }
    const request = fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-affine-version': BUILD_CONFIG.appVersion,
      },
      body: JSON.stringify({ url, include: ['transcript'] }),
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Link preview unavailable');
      return (await response.json()) as ShareLinkPreview;
    });
    this.inFlight = { endpoint, controller, request };
    void request.then(
      () => {
        signal?.removeEventListener('abort', abort);
        if (this.inFlight?.request === request) this.inFlight = undefined;
      },
      () => {
        signal?.removeEventListener('abort', abort);
        if (this.inFlight?.request === request) this.inFlight = undefined;
      }
    );
    return request;
  }

  private setEndpoint(endpoint: string | undefined, workspaceKey?: string) {
    if (this.endpoint !== endpoint) {
      this.inFlight?.controller.abort();
      this.inFlight = undefined;
    }
    this.endpoint = endpoint;
    this.selectedWorkspaceKey = workspaceKey;
  }
}

export function resolveShareWorkspaceMode(
  servers: Server[],
  hasSignedInAccount: boolean
) {
  const types = servers.map(server => server.config$.value?.type);
  if (types.includes(ServerDeploymentType.Selfhosted))
    return 'selfHostedPresent' as const;
  if (types.some(type => type === undefined)) return 'unknown' as const;
  return hasSignedInAccount ? ('cloudOnly' as const) : ('signedOut' as const);
}
