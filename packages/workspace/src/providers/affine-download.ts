import { DebugLogger } from '@affine/debug';
import type { AffineDownloadProvider } from '@affine/env/workspace';
import { assertExists, Workspace } from '@blocksuite/store';

import { affineApis } from '../affine/shared';

const hashMap = new Map<string, ArrayBuffer>();

const logger = new DebugLogger('affine:workspace:download-provider');

export const createAffineDownloadProvider = (
  blockSuiteWorkspace: Workspace
): AffineDownloadProvider => {
  assertExists(blockSuiteWorkspace.id);
  const id = blockSuiteWorkspace.id;
  let connected = false;
  const callbacks = new Set<() => void>();
  return {
    flavour: 'affine-download',
    background: true,
    get connected() {
      return connected;
    },
    callbacks,
    connect: () => {
      logger.info('connect download provider', id);
      if (hashMap.has(id)) {
        logger.debug('applyUpdate');
        Workspace.Y.applyUpdate(
          blockSuiteWorkspace.doc,
          new Uint8Array(hashMap.get(id) as ArrayBuffer)
        );
        connected = true;
        callbacks.forEach(cb => cb());
        return;
      }
      affineApis
        .downloadWorkspace(id, false)
        .then(binary => {
          hashMap.set(id, binary);
          logger.debug('applyUpdate');
          Workspace.Y.applyUpdate(
            blockSuiteWorkspace.doc,
            new Uint8Array(binary)
          );
          connected = true;
          callbacks.forEach(cb => cb());
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
