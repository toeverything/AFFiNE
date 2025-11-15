import { DEFAULT_LINK_PREVIEW_ENDPOINT } from '@blocksuite/affine/shared/consts';
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

class AffineLinkPreviewService extends LinkPreviewService {
  constructor(endpoint: string, cache: LinkPreviewCacheProvider) {
    super(cache);
    this.setEndpoint(endpoint);
  }
}

/**
 * Patch the link preview service, set the endpoint and cache
 * @param framework
 * @returns
 */
export function patchLinkPreviewService(
  framework: FrameworkProvider
): ExtensionType {
  // get link preview service endpoint from server and BUILD_CONFIG
  let linkPreviewUrl: string;
  try {
    const server = framework.get(ServerService).server;
    linkPreviewUrl = new URL(
      BUILD_CONFIG.linkPreviewUrl || '/',
      server.baseUrl
    ).toString();
  } catch (err) {
    console.error(
      'Invalid BUILD_CONFIG.linkPreviewUrl, falling back to default',
      err
    );
    linkPreviewUrl = DEFAULT_LINK_PREVIEW_ENDPOINT;
  }

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
