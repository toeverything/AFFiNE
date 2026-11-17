import { DocsService } from '@affine/core/modules/doc';
import {
  DocsQuickSearchSession,
  QuickSearchService,
} from '@affine/core/modules/quicksearch';
import { DatabaseMoveExtension } from '@blocksuite/affine/shared/services';
import type { FrameworkProvider } from '@toeverything/infra';

/**
 * Reuses the general-purpose `DocsQuickSearchSession` (the same session
 * behind the app's own Cmd-K "search all docs" results) rather than
 * building a bespoke doc-only picker session — mirrors `patchNoteMoveService`
 * (Story 0.5) exactly. Picking the current doc is rejected as a no-op
 * (moving a database into the doc it's already in isn't a move at all).
 */
export function patchDatabaseMoveService(framework: FrameworkProvider) {
  return DatabaseMoveExtension({
    async moveDatabaseToAnotherDoc(databaseId, currentDocId) {
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
              i18nKey: 'com.affine.cmdk.move-database-to-doc.title',
            },
            placeholder: {
              i18nKey: 'com.affine.cmdk.move-database-to-doc.placeholder',
            },
          }
        );
      });

      if (!destinationDocId || destinationDocId === currentDocId) {
        return false;
      }

      return framework
        .get(DocsService)
        .relocateDatabaseToAnotherDoc(
          currentDocId,
          databaseId,
          destinationDocId
        );
    },
  });
}
