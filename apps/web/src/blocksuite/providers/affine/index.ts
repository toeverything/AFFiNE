import type { AffineDownloadProvider } from '@affine/workspace/type';
import { assertExists } from '@blocksuite/store';

import { BlockSuiteWorkspace } from '../../../shared';
import { affineApis } from '../../../shared/apis';
import { providerLogger } from '../../logger';

const hashMap = new Map<string, ArrayBuffer>();

export const createAffineDownloadProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
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
      providerLogger.info('connect download provider', id);
      if (hashMap.has(id)) {
        providerLogger.debug('applyUpdate');
        BlockSuiteWorkspace.Y.applyUpdate(
          blockSuiteWorkspace.doc,
          new Uint8Array(hashMap.get(id) as ArrayBuffer)
        );
        connected = true;
        return;
      }
      affineApis
        .downloadWorkspace(id, false)
        .then(binary => {
          hashMap.set(id, binary);
          providerLogger.debug('applyUpdate');
          BlockSuiteWorkspace.Y.applyUpdate(
            blockSuiteWorkspace.doc,
            new Uint8Array(binary)
          );
        })
        .catch(e => {
          providerLogger.error('downloadWorkspace', e);
        });
    },
    disconnect: () => {
      providerLogger.info('disconnect download provider', id);
      connected = false;
    },
    cleanup: () => {
      hashMap.delete(id);
    },
  };
};
