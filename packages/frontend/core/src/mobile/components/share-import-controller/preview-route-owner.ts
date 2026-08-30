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

const previewLimits = {
  aggregate: 256 * 1024,
  url: 8192,
  urls: 8,
  title: 4096,
  description: 32768,
  provider: 256,
  siteName: 512,
  author: 512,
  publishedAt: 128,
  language: 128,
  segmentText: 16384,
  speaker: 512,
  segments: 500,
  chapters: 100,
  duration: 7 * 24 * 60 * 60,
} as const;

const invalidField = Symbol('invalid-share-preview-field');
const utf8Encoder = new TextEncoder();
const swiftWhitespace = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
const rfc3986Punctuation = new Set("-._~:/?#[]@!$&'()*+,;=%");

function trimmedBySwift(value: string) {
  let start = 0;
  let end = value.length;
  while (start < end && swiftWhitespace.has(value.charCodeAt(start))) start++;
  while (end > start && swiftWhitespace.has(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
}

function containsOnlyRFC3986URLCharacters(value: string) {
  return [...value].every(character => {
    const code = character.charCodeAt(0);
    return (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      rfc3986Punctuation.has(character)
    );
  });
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function boundedString(
  value: Record<string, unknown>,
  key: string,
  limit: number
): string | undefined | typeof invalidField {
  if (!hasOwn(value, key)) return undefined;
  const field = value[key];
  if (
    typeof field !== 'string' ||
    !field ||
    trimmedBySwift(field) !== field ||
    utf8Encoder.encode(field).byteLength > limit
  ) {
    return invalidField;
  }
  return field;
}

function boundedNumber(
  value: Record<string, unknown>,
  key: string
): number | undefined | typeof invalidField {
  if (!hasOwn(value, key)) return undefined;
  const field = value[key];
  return typeof field === 'number' &&
    Number.isFinite(field) &&
    field >= 0 &&
    field <= previewLimits.duration
    ? field
    : invalidField;
}

function isWebURL(value: string) {
  if (
    trimmedBySwift(value) !== value ||
    !/^https?:\/\//iu.test(value) ||
    !containsOnlyRFC3986URLCharacters(value) ||
    /%(?![\dA-Fa-f]{2})/u.test(value) ||
    utf8Encoder.encode(value).byteLength > previewLimits.url
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isOfficialMediaURL(value: string) {
  if (
    !/^https:\/\//iu.test(value) ||
    utf8Encoder.encode(value).byteLength > previewLimits.url
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'app.affine.pro' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      url.pathname === '/api/worker/image-proxy'
    );
  } catch {
    return false;
  }
}

function optionalURLArray(
  value: Record<string, unknown>,
  key: string
): string[] | undefined | typeof invalidField {
  if (!hasOwn(value, key)) return undefined;
  const field = value[key];
  if (
    !Array.isArray(field) ||
    field.length > previewLimits.urls ||
    !field.every(item => typeof item === 'string' && isOfficialMediaURL(item))
  ) {
    return invalidField;
  }
  return [...field];
}

export function parseShareLinkPreview(
  value: unknown
): ShareLinkPreview | undefined {
  if (
    !isRecord(value) ||
    typeof value.url !== 'string' ||
    !isWebURL(value.url)
  ) {
    return undefined;
  }
  const preview: ShareLinkPreview = { url: value.url };
  const strings = [
    ['title', previewLimits.title],
    ['siteName', previewLimits.siteName],
    ['description', previewLimits.description],
    ['mediaType', previewLimits.provider],
    ['provider', previewLimits.provider],
    ['publishedAt', previewLimits.publishedAt],
  ] as const;
  for (const [key, limit] of strings) {
    const field = boundedString(value, key, limit);
    if (field === invalidField) return undefined;
    if (field !== undefined) preview[key] = field;
  }
  for (const key of ['images', 'favicons'] as const) {
    const field = optionalURLArray(value, key);
    if (field === invalidField) return undefined;
    if (field !== undefined) preview[key] = field;
  }

  if (hasOwn(value, 'author')) {
    if (!isRecord(value.author)) return undefined;
    const name = boundedString(value.author, 'name', previewLimits.author);
    const handle = boundedString(value.author, 'handle', previewLimits.author);
    if (
      name === undefined ||
      name === invalidField ||
      handle === invalidField
    ) {
      return undefined;
    }
    const author: NonNullable<ShareLinkPreview['author']> = { name };
    if (handle !== undefined) author.handle = handle;
    if (hasOwn(value.author, 'avatar')) {
      if (
        typeof value.author.avatar !== 'string' ||
        !isOfficialMediaURL(value.author.avatar)
      ) {
        return undefined;
      }
      author.avatar = value.author.avatar;
    }
    preview.author = author;
  }

  const durationSeconds = boundedNumber(value, 'durationSeconds');
  if (durationSeconds === invalidField) return undefined;
  if (durationSeconds !== undefined) preview.durationSeconds = durationSeconds;

  if (hasOwn(value, 'transcript')) {
    if (!isRecord(value.transcript)) return undefined;
    const transcriptValue = value.transcript;
    const language = boundedString(
      transcriptValue,
      'language',
      previewLimits.language
    );
    if (language === invalidField) return undefined;
    if (
      !Array.isArray(transcriptValue.segments) ||
      transcriptValue.segments.length === 0 ||
      transcriptValue.segments.length > previewLimits.segments
    ) {
      return undefined;
    }
    const segments: NonNullable<ShareLinkPreview['transcript']>['segments'] =
      [];
    for (const segmentValue of transcriptValue.segments) {
      if (!isRecord(segmentValue)) return undefined;
      const text = boundedString(
        segmentValue,
        'text',
        previewLimits.segmentText
      );
      const startSeconds = boundedNumber(segmentValue, 'startSeconds');
      const duration = boundedNumber(segmentValue, 'durationSeconds');
      const speaker = boundedString(
        segmentValue,
        'speaker',
        previewLimits.speaker
      );
      if (
        text === undefined ||
        text === invalidField ||
        startSeconds === invalidField ||
        duration === invalidField ||
        speaker === invalidField
      ) {
        return undefined;
      }
      segments.push({
        text,
        ...(startSeconds === undefined ? {} : { startSeconds }),
        ...(duration === undefined ? {} : { durationSeconds: duration }),
        ...(speaker === undefined ? {} : { speaker }),
      });
    }
    const transcript: NonNullable<ShareLinkPreview['transcript']> = {
      segments,
    };
    if (language !== undefined) transcript.language = language;
    if (hasOwn(transcriptValue, 'chapters')) {
      if (
        !Array.isArray(transcriptValue.chapters) ||
        transcriptValue.chapters.length > previewLimits.chapters
      ) {
        return undefined;
      }
      const chapters: NonNullable<
        NonNullable<ShareLinkPreview['transcript']>['chapters']
      > = [];
      for (const chapterValue of transcriptValue.chapters) {
        if (!isRecord(chapterValue)) return undefined;
        const title = boundedString(chapterValue, 'title', previewLimits.title);
        const startSeconds = boundedNumber(chapterValue, 'startSeconds');
        if (
          title === undefined ||
          title === invalidField ||
          startSeconds === undefined ||
          startSeconds === invalidField
        ) {
          return undefined;
        }
        chapters.push({ title, startSeconds });
      }
      transcript.chapters = chapters;
    }
    if (hasOwn(transcriptValue, 'truncated')) {
      if (typeof transcriptValue.truncated !== 'boolean') return undefined;
      transcript.truncated = transcriptValue.truncated;
    }
    preview.transcript = transcript;
  }

  try {
    const json = JSON.stringify(preview);
    const jsonSize = utf8Encoder.encode(json).byteLength;
    const negativeZeroCount = [
      preview.durationSeconds,
      ...(preview.transcript?.segments.flatMap(segment => [
        segment.startSeconds,
        segment.durationSeconds,
      ]) ?? []),
      ...(preview.transcript?.chapters?.map(chapter => chapter.startSeconds) ??
        []),
    ].filter(value => Object.is(value, -0)).length;
    const swiftJSONSize =
      utf8Encoder.encode(json.replaceAll('/', '\\/')).byteLength +
      negativeZeroCount;
    return jsonSize <= previewLimits.aggregate &&
      swiftJSONSize <= previewLimits.aggregate
      ? preview
      : undefined;
  } catch {
    return undefined;
  }
}

function parseRoutedLinkPreview(value: unknown): ShareLinkPreview {
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
        const preview = parseRoutedLinkPreview(await response.json());
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
