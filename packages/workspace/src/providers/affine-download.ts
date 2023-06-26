import { DebugLogger } from '@affine/debug';
import type { AffineDownloadProvider } from '@affine/env/workspace';
import type { DocProviderCreator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';

import { affineApis } from '../affine/shared';

const hashMap = new Map<string, ArrayBuffer>();

const logger = new DebugLogger('affine:workspace:download-provider');

export const createAffineDownloadProvider: DocProviderCreator = (
  id,
  doc
): AffineDownloadProvider => {
  let connected = false;
  return {
    flavour: 'affine-download',
    passive: true,
    get connected() {
      return connected;
    },
    connect: () => {
      logger.info('connect download provider', id);
      if (hashMap.has(id)) {
        logger.debug('applyUpdate');
        Workspace.Y.applyUpdate(
          doc,
          new Uint8Array(hashMap.get(id) as ArrayBuffer)
        );
        connected = true;
        return;
      }
      affineApis
        .downloadWorkspace(id, false)
        .then(binary => {
          hashMap.set(id, binary);
          logger.debug('applyUpdate');
          Workspace.Y.applyUpdate(doc, new Uint8Array(binary));
          connected = true;
        })
        .catch(e => {
          logger.error('downloadWorkspace', e);
        });
    },
    disconnect: () => {
      logger.info('disconnect download provider', id);
      connected = false;
    },
    cleanup: () => {
      hashMap.delete(id);
    },
  };
};
