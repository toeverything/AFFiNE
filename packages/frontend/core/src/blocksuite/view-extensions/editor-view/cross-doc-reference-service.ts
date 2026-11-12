import {
  CrossDocReferenceQuickSearchSession,
  QuickSearchService,
} from '@affine/core/modules/quicksearch';
import {
  type CrossDocReferenceCandidate,
  CrossDocReferenceExtension,
} from '@blocksuite/affine/shared/services';
import type { FrameworkProvider } from '@toeverything/infra';

export function patchCrossDocReferenceService(framework: FrameworkProvider) {
  return CrossDocReferenceExtension({
    async openCrossDocReferencePicker(excludeDocId, allowedFlavours) {
      return new Promise<CrossDocReferenceCandidate | null>(resolve => {
        framework.get(QuickSearchService).quickSearch.show(
          [
            framework.createEntity(CrossDocReferenceQuickSearchSession, {
              excludeDocId,
              allowedFlavours,
            }),
          ],
          result => {
            if (!result || result.source !== 'cross-doc-reference') {
              resolve(null);
              return;
            }
            resolve({
              docId: result.payload.docId,
              blockId: result.payload.blockIds[0],
              flavour: result.payload.flavour,
            });
          },
          {
            label: {
              i18nKey: 'com.affine.cmdk.cross-doc-reference.title',
            },
            placeholder: {
              i18nKey: 'com.affine.cmdk.cross-doc-reference.placeholder',
            },
          }
        );
      });
    },
  });
}
