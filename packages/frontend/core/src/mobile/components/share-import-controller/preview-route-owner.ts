import type { Server } from '@affine/core/modules/cloud';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { ServerDeploymentType, ServerFeature } from '@affine/graphql';

import type { PendingShareItem, ShareLinkPreview } from './types';

const LINK_PREVIEW_PATH = '/api/worker/link-preview';
const SHARE_PREVIEW_WRITER_GATE_C_APPROVED = false;

interface SharePreviewRouteOwnerOptions {
  gateCApproved?: boolean;
}

export type SharePreviewState = {
  itemId: string;
  workspaceKey: string;
  generation: number;
  value: ShareLinkPreview;
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseShareLinkPreview(value: unknown): ShareLinkPreview {
  if (!isRecord(value) || typeof value.url !== 'string') {
    throw new Error('Invalid link preview response');
  }
  const preview: ShareLinkPreview = { url: value.url };
  for (const key of [
    'title',
    'siteName',
    'description',
    'mediaType',
    'publishedAt',
  ] as const) {
    if (typeof value[key] === 'string') preview[key] = value[key];
  }
  for (const key of ['images', 'favicons'] as const) {
    if (Array.isArray(value[key])) {
      preview[key] = value[key].filter(item => typeof item === 'string');
    }
  }
  if (isRecord(value.author) && typeof value.author.name === 'string') {
    preview.author = {
      name: value.author.name,
      ...(typeof value.author.handle === 'string'
        ? { handle: value.author.handle }
        : {}),
      ...(typeof value.author.avatar === 'string'
        ? { avatar: value.author.avatar }
        : {}),
    };
  }
  return preview;
}

export class SharePreviewRouteOwner {
  private endpoint: string | undefined;
  private server: Server | undefined;
  private inFlight:
    | {
        generation: number;
        controller: AbortController;
        request: Promise<ShareLinkPreview>;
      }
    | undefined;
  private selectedWorkspaceKey: string | undefined;
  private requestGeneration = 0;

  constructor(
    private readonly item: PendingShareItem,
    private readonly options: SharePreviewRouteOwnerOptions = {}
  ) {
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
      this.inFlight?.generation === this.requestGeneration &&
      !this.inFlight.controller.signal.aborted
    ) {
      return this.inFlight.request;
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
        body: JSON.stringify({ url }),
        credentials: 'omit',
        signal: controller.signal,
      })
      .then(async response => {
        if (!response.ok) throw new Error('Link preview unavailable');
        const preview = parseShareLinkPreview(await response.json());
        if (
          this.selectedWorkspaceKey !== workspaceKey ||
          this.requestGeneration !== generation
        ) {
          throw new DOMException('Stale link preview response', 'AbortError');
        }
        Object.defineProperty(preview, 'authorizeDetailsWrite', {
          value: this.createDetailsWriteAuthorization({
            itemId: this.item.id,
            workspaceKey,
            generation,
            server,
          }),
          enumerable: false,
        });
        return preview;
      });
    this.inFlight = { generation, controller, request };
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

  private createDetailsWriteAuthorization({
    itemId,
    workspaceKey,
    generation,
    server,
  }: {
    itemId: string;
    workspaceKey: string;
    generation: number;
    server: Server;
  }) {
    return async (signal: AbortSignal) => {
      const gateCApproved =
        this.options.gateCApproved ?? SHARE_PREVIEW_WRITER_GATE_C_APPROVED;
      if (
        !gateCApproved ||
        !this.matchesRoute({ itemId, workspaceKey, generation, server })
      ) {
        return false;
      }
      const config = await server.fetchFreshConfig(signal);
      return (
        this.matchesRoute({ itemId, workspaceKey, generation, server }) &&
        config.features.includes(ServerFeature.SharePreviewBlobRefs)
      );
    };
  }

  private matchesRoute({
    itemId,
    workspaceKey,
    generation,
    server,
  }: {
    itemId: string;
    workspaceKey: string;
    generation: number;
    server: Server;
  }) {
    return (
      this.item.id === itemId &&
      this.selectedWorkspaceKey === workspaceKey &&
      this.requestGeneration === generation &&
      this.server === server
    );
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
      this.inFlight?.controller.abort();
      this.inFlight = undefined;
      this.requestGeneration += 1;
    }
    this.server = server;
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
