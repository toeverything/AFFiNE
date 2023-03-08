import { assertExists } from '@blocksuite/store';

import { AffineDownloadProvider, BlockSuiteWorkspace } from '../../../shared';
import { apis } from '../../../shared/apis';
import { providerLogger } from '../../logger';

const hashMap = new Map<string, ArrayBuffer>();

export const createAffineDownloadProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): AffineDownloadProvider => {
  assertExists(blockSuiteWorkspace.id);
  const id = blockSuiteWorkspace.id;
  return {
    flavour: 'affine-download',
    background: true,
    connect: () => {
      providerLogger.info('connect download provider', id);
      if (hashMap.has(id)) {
        providerLogger.debug('applyUpdate');
        BlockSuiteWorkspace.Y.applyUpdate(
          blockSuiteWorkspace.doc,
          new Uint8Array(hashMap.get(id) as ArrayBuffer)
        );
        return;
      }
      apis.downloadWorkspace(id, false).then(binary => {
        hashMap.set(id, binary);
        providerLogger.debug('applyUpdate');
        BlockSuiteWorkspace.Y.applyUpdate(
          blockSuiteWorkspace.doc,
          new Uint8Array(binary)
        );
      });
    },
    disconnect: () => {
      providerLogger.info('disconnect download provider', id);
    },
    cleanup: () => {
      hashMap.delete(id);
    },
  };
};
