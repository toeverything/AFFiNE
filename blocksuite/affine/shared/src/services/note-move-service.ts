import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

export interface NoteMoveService {
  /**
   * Lets the user pick an existing, different doc from the workspace and
   * relocates `noteId` (currently hosted in `currentDocId`) into that doc's
   * root — the "Move to another page" action (Story 0.5) on a Note's own
   * edgeless toolbar. Every existing `affine:note-ref` (in any doc)
   * pointing at this note is repointed to the new location.
   *
   * Resolves `true` on a successful move, `false` if the user cancelled the
   * picker or the move itself failed.
   */
  moveNoteToAnotherDoc: (
    noteId: string,
    currentDocId: string
  ) => Promise<boolean>;
}

export const NoteMoveProvider = createIdentifier<NoteMoveService>(
  'AffineNoteMoveService'
);

export function NoteMoveExtension(service: NoteMoveService): ExtensionType {
  return {
    setup: di => {
      di.addImpl(NoteMoveProvider, service);
    },
  };
}
