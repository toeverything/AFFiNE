import type { BlockStdScope } from '@blocksuite/std';
import type { TransformerMiddleware } from '@blocksuite/store';

export const surfaceRefToEmbed =
  (std: BlockStdScope): TransformerMiddleware =>
  ({ slots }) => {
    let pageId: string | null = null;
    const beforeImportSliceSubscription = slots.beforeImport.subscribe(
      payload => {
        if (payload.type === 'slice') {
          pageId = payload.snapshot.pageId;
        }
      }
    );
    const beforeImportBlockSubscription = slots.beforeImport.subscribe(
      payload => {
        // only handle surface-ref block snapshot
        if (
          payload.type !== 'block' ||
          payload.snapshot.flavour !== 'affine:surface-ref'
        )
          return;

        // turn into embed-linked-doc if the current doc is different from the pageId of the surface-ref block
        const isNotSameDoc = pageId !== std.store.doc.id;
        if (pageId && isNotSameDoc) {
          // The blockId of the original surface-ref block
          const blockId = payload.snapshot.id;
          payload.snapshot.id = std.workspace.idGenerator();
          payload.snapshot.flavour = 'affine:embed-linked-doc';
          payload.snapshot.props = {
            pageId,
            params: {
              mode: 'page',
              blockIds: [blockId],
            },
          };
        }
      }
    );

    return () => {
      beforeImportSliceSubscription.unsubscribe();
      beforeImportBlockSubscription.unsubscribe();
    };
  };
