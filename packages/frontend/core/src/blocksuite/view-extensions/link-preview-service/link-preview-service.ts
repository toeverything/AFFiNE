import {
  LinkPreviewCacheIdentifier,
  type LinkPreviewCacheProvider,
  LinkPreviewService,
  LinkPreviewServiceIdentifier,
} from '@blocksuite/affine/shared/services';
import { type ExtensionType } from '@blocksuite/affine/store';
import type { Container } from '@blocksuite/global/di';
import type { FrameworkProvider } from '@toeverything/infra';

import { ServerService } from '../../../modules/cloud/services/server';

const LINK_PREVIEW_PATH = '/api/worker/link-preview';

export function resolveLinkPreviewEndpoint(value: string, baseUrl: string) {
  if (!value.trim() || !URL.canParse(value, baseUrl)) return null;
  const endpoint = new URL(value, baseUrl);
  return endpoint.pathname === LINK_PREVIEW_PATH ? endpoint.toString() : null;
}

class AffineLinkPreviewService extends LinkPreviewService {
  constructor(endpoint: string | null, cache: LinkPreviewCacheProvider) {
    super(cache, createAffineLinkPreviewFetch(BUILD_CONFIG.appVersion));
    this.setEndpoint(endpoint);
  }
}

export function createAffineLinkPreviewFetch(
  version: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (version) headers.set('x-affine-version', version);
    return fetcher(input, { ...init, headers });
  };
}

/**
 * Patch the link preview service, set the endpoint and cache
 * @param framework
 * @returns
 */
export function patchLinkPreviewService(
  framework: FrameworkProvider
): ExtensionType {
  const server = framework.get(ServerService).server;
  const linkPreviewUrl = resolveLinkPreviewEndpoint(
    BUILD_CONFIG.linkPreviewUrl,
    server.baseUrl
  );

  return {
    setup: (di: Container) => {
      di.override(LinkPreviewServiceIdentifier, provider => {
        return new AffineLinkPreviewService(
          linkPreviewUrl,
          provider.get(LinkPreviewCacheIdentifier)
        );
      });
    },
  };
}
