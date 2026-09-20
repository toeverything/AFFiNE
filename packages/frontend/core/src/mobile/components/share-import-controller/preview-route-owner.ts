import type { Server } from '@affine/core/modules/cloud';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';
import { isImageProxyURL } from '@blocksuite/affine/shared/adapters';

import { readShareLinkPreview } from './preview';
import type { PendingShareItem, ShareLinkPreview } from './types';

const LINK_PREVIEW_PATH = '/api/worker/link-preview';
const OFFICIAL_ENDPOINT = `https://app.affine.pro${LINK_PREVIEW_PATH}`;
export class SharePreviewRouteOwner {
  private endpoint: string | undefined;
  private server: Server | undefined;
  private previewRequest:
    | {
        generation: number;
        controller: AbortController;
        request: Promise<ShareLinkPreview>;
      }
    | undefined;
  private selectedWorkspaceKey: string | undefined;
  private requestGeneration = 0;

  constructor(private readonly item: PendingShareItem) {
    this.selectedWorkspaceKey = undefined;
  }

  get routeEndpoint() {
    return this.endpoint;
  }

  get generation() {
    return this.requestGeneration;
  }

  get workspaceKey() {
    return this.selectedWorkspaceKey;
  }

  selectWorkspace(workspace: WorkspaceMetadata | undefined, servers: Server[]) {
    if (this.item.previewRoute === 'official') {
      this.setRoute(undefined, OFFICIAL_ENDPOINT, 'official');
      return;
    }
    if (!workspace || workspace.flavour === 'local') {
      this.setRoute(
        undefined,
        undefined,
        workspace ? `${workspace.flavour}:${workspace.id}` : undefined
      );
      return;
    }
    const workspaceKey = `${workspace.flavour}:${workspace.id}`;
    const server = servers.find(server => server.id === workspace.flavour);
    const type = server?.config$.value?.type;
    if (type === ServerDeploymentType.Affine) {
      this.setRoute(undefined, OFFICIAL_ENDPOINT, workspaceKey);
    } else if (server && type === ServerDeploymentType.Selfhosted) {
      this.setRoute(
        server,
        new URL(LINK_PREVIEW_PATH, server.baseUrl).toString(),
        workspaceKey
      );
    } else {
      this.setRoute(undefined, undefined, workspaceKey);
    }
  }

  load(signal?: AbortSignal): Promise<ShareLinkPreview> | undefined {
    const url = this.item.content.url;
    if (!url || !this.endpoint || !this.selectedWorkspaceKey) {
      return undefined;
    }
    if (
      this.previewRequest?.generation === this.requestGeneration &&
      !this.previewRequest.controller.signal.aborted
    ) {
      return this.previewRequest.request;
    }
    const server = this.server;
    const endpoint = this.endpoint;
    const workspaceKey = this.selectedWorkspaceKey;
    const generation = this.requestGeneration;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener('abort', abort, { once: true });
    }
    const fetcher = server ? server.fetch : globalThis.fetch;
    const request = fetcher(server ? LINK_PREVIEW_PATH : endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-affine-version': BUILD_CONFIG.appVersion,
      },
      body: JSON.stringify({ url, include: ['transcript'] }),
      credentials: 'omit',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    }).then(async response => {
      if (!response.ok) throw new Error('Link preview unavailable');
      const preview = await readShareLinkPreview(response);
      const proxyMedia = (value: string) => {
        const source = new URL(value);
        const proxy = new URL('/api/worker/image-proxy', endpoint);
        if (isImageProxyURL(value) && source.origin === proxy.origin)
          return value;
        proxy.searchParams.set(
          'url',
          isImageProxyURL(value)
            ? (source.searchParams.get('url') ?? value)
            : value
        );
        return proxy.toString();
      };
      preview.images = preview.images?.map(proxyMedia);
      preview.favicons = preview.favicons?.map(proxyMedia);
      if (preview.author?.avatar)
        preview.author.avatar = proxyMedia(preview.author.avatar);
      if (
        this.selectedWorkspaceKey !== workspaceKey ||
        this.requestGeneration !== generation
      ) {
        throw new DOMException('Stale link preview response', 'AbortError');
      }
      return preview;
    });
    this.previewRequest = { generation, controller, request };
    void request.then(
      () => {
        signal?.removeEventListener('abort', abort);
      },
      () => {
        signal?.removeEventListener('abort', abort);
      }
    );
    return request;
  }

  private setRoute(
    server: Server | undefined,
    endpoint: string | undefined,
    workspaceKey?: string
  ) {
    const routeChanged =
      this.selectedWorkspaceKey !== workspaceKey ||
      this.server !== server ||
      this.endpoint !== endpoint;
    if (routeChanged) {
      this.previewRequest?.controller.abort();
      this.previewRequest = undefined;
      this.requestGeneration += 1;
    }
    this.server = server;
    this.endpoint = endpoint;
    this.selectedWorkspaceKey = workspaceKey;
  }
}
