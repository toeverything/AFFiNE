import type { Server } from '@affine/core/modules/cloud';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';

import type { PendingShareItem, ShareLinkPreview } from './types';

const LINK_PREVIEW_PATH = '/api/worker/link-preview';
const OFFICIAL_LINK_PREVIEW_ENDPOINT = `https://app.affine.pro${LINK_PREVIEW_PATH}`;

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
  if (value.provider === 'youtube' || value.provider === 'x') {
    preview.provider = value.provider;
  }
  for (const key of ['images', 'favicons'] as const) {
    if (Array.isArray(value[key])) {
      preview[key] = value[key].filter(item => typeof item === 'string');
    }
  }
  if (typeof value.durationSeconds === 'number') {
    preview.durationSeconds = value.durationSeconds;
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
  if (isRecord(value.transcript) && Array.isArray(value.transcript.segments)) {
    preview.transcript = {
      ...(typeof value.transcript.language === 'string'
        ? { language: value.transcript.language }
        : {}),
      segments: value.transcript.segments
        .filter(isRecord)
        .filter(segment => typeof segment.text === 'string')
        .map(segment => ({
          text: segment.text as string,
          ...(typeof segment.startSeconds === 'number'
            ? { startSeconds: segment.startSeconds }
            : {}),
          ...(typeof segment.durationSeconds === 'number'
            ? { durationSeconds: segment.durationSeconds }
            : {}),
          ...(typeof segment.speaker === 'string'
            ? { speaker: segment.speaker }
            : {}),
        })),
      ...(Array.isArray(value.transcript.chapters)
        ? {
            chapters: value.transcript.chapters
              .filter(isRecord)
              .filter(
                chapter =>
                  typeof chapter.title === 'string' &&
                  typeof chapter.startSeconds === 'number'
              )
              .map(chapter => ({
                title: chapter.title as string,
                startSeconds: chapter.startSeconds as number,
              })),
          }
        : {}),
      ...(typeof value.transcript.truncated === 'boolean'
        ? { truncated: value.transcript.truncated }
        : {}),
    };
  }
  return preview;
}

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
      return parseShareLinkPreview(await response.json());
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
