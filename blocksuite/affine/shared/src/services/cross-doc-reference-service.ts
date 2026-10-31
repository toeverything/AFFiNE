import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

export type CrossDocReferenceCandidate = {
  docId: string;
  blockId: string;
  flavour: 'affine:frame' | 'affine:database' | 'affine:note';
};

export interface CrossDocReferenceService {
  /**
   * Opens a picker over every Frame/Database/Note block in the workspace
   * except the ones living in `excludeDocId`, resolving to the one the
   * user picked (or `null` if they cancelled).
   */
  openCrossDocReferencePicker: (
    excludeDocId: string,
    allowedFlavours?: ('affine:frame' | 'affine:database' | 'affine:note')[]
  ) => Promise<CrossDocReferenceCandidate | null>;
}

export const CrossDocReferenceProvider =
  createIdentifier<CrossDocReferenceService>('AffineCrossDocReferenceService');

export function CrossDocReferenceExtension(
  service: CrossDocReferenceService
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(CrossDocReferenceProvider, service);
    },
  };
}
