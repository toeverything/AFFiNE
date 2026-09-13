import type { Server } from '@affine/core/modules/cloud';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';
import { isImageProxyURL } from '@blocksuite/affine/shared/adapters';

import { readShareLinkPreview } from './preview';
import type { PendingShareItem, ShareLinkPreview } from './types';

const LINK_PREVIEW_PATH = '/api/worker/link-preview';
export type SharePreviewState = {
  itemId: string;
  workspaceKey: string;
  generation: number;
  value: ShareLinkPreview;
};
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
    const canPreview =
      type === ServerDeploymentType.Selfhosted ||
      type === ServerDeploymentType.Affine;
    this.setRoute(
      canPreview ? server : undefined,
      canPreview && server
        ? new URL(LINK_PREVIEW_PATH, server.baseUrl).toString()
        : undefined,
      workspaceKey
    );
  }

  load(signal?: AbortSignal): Promise<ShareLinkPreview> | undefined {
    const url = this.item.content.url;
    if (!url || !this.endpoint || !this.server || !this.selectedWorkspaceKey) {
      return undefined;
    }
    if (
      this.previewRequest?.generation === this.requestGeneration &&
      !this.previewRequest.controller.signal.aborted
    ) {
      return this.previewRequest.request;
    }
    const server = this.server;
    const workspaceKey = this.selectedWorkspaceKey;
    const generation = this.requestGeneration;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener('abort', abort, { once: true });
    }
    const request = server
      .fetch(LINK_PREVIEW_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, include: ['transcript'] }),
        credentials: 'omit',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      })
      .then(async response => {
        if (!response.ok) throw new Error('Link preview unavailable');
        const preview = await readShareLinkPreview(response);
        const proxyMedia = (value: string) => {
          const source = new URL(value);
          const proxy = new URL('/api/worker/image-proxy', server.baseUrl);
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

export async function previewForImport(
  item: PendingShareItem,
  workspace: WorkspaceMetadata,
  current: SharePreviewState | undefined,
  currentOwner: SharePreviewRouteOwner | undefined,
  servers: Server[]
) {
  if (item.content.kind !== 'url') return undefined;
  const owner = currentOwner ?? new SharePreviewRouteOwner(item);
  owner.selectWorkspace(workspace, servers);
  const selectedWorkspaceKey = `${workspace.flavour}:${workspace.id}`;
  const generation = owner.generation;
  if (
    current?.itemId === item.id &&
    current.workspaceKey === selectedWorkspaceKey &&
    current.generation === generation
  ) {
    return current.value;
  }
  const controller = new AbortController();
  const request = owner.load(controller.signal);
  if (!request) return undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const preview = await Promise.race([
      request.catch(() => undefined),
      new Promise<undefined>(resolve => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(undefined);
        }, 1200);
      }),
    ]);
    return owner.workspaceKey === selectedWorkspaceKey &&
      owner.generation === generation
      ? preview
      : undefined;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
