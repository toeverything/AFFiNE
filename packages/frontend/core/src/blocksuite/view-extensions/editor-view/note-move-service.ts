import { DocsService } from '@affine/core/modules/doc';
import {
  DocsQuickSearchSession,
  QuickSearchService,
} from '@affine/core/modules/quicksearch';
import { NoteMoveExtension } from '@blocksuite/affine/shared/services';
import type { FrameworkProvider } from '@toeverything/infra';

/**
 * Reuses the general-purpose `DocsQuickSearchSession` (the same session
 * behind the app's own Cmd-K "search all docs" results) rather than
 * building a bespoke doc-only picker session — it already does everything
 * needed here (fuzzy title search across every doc in the workspace) and
 * its payload already carries a bare `docId`. The one thing it doesn't do
 * — excluding the doc currently being edited — is handled here instead:
 * picking the current doc is rejected as a no-op (moving a note into the
 * doc it's already in isn't a move at all) rather than filtering the
 * shared session's own query behavior, keeping this bridge's footprint
 * small.
 */
export function patchNoteMoveService(framework: FrameworkProvider) {
  return NoteMoveExtension({
    async moveNoteToAnotherDoc(noteId, currentDocId) {
      const destinationDocId = await new Promise<string | null>(resolve => {
        framework.get(QuickSearchService).quickSearch.show(
          [framework.createEntity(DocsQuickSearchSession)],
          result => {
            if (!result || result.source !== 'docs' || !result.payload.docId) {
              resolve(null);
              return;
            }
            resolve(result.payload.docId);
          },
          {
            label: {
              i18nKey: 'com.affine.cmdk.move-note-to-doc.title',
            },
            placeholder: {
              i18nKey: 'com.affine.cmdk.move-note-to-doc.placeholder',
            },
          }
        );
      });

      if (!destinationDocId || destinationDocId === currentDocId) {
        return false;
      }

      return framework
        .get(DocsService)
        .relocateNoteToAnotherDoc(currentDocId, noteId, destinationDocId);
    },
  });
}
