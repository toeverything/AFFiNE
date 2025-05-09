import { EmbedSyncedDocBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

export const embedSyncedDocBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
    flavour: EmbedSyncedDocBlockSchema.model.flavour,
    toMatch: () => false,
    fromMatch: o => o.node.flavour === EmbedSyncedDocBlockSchema.model.flavour,
    toBlockSnapshot: {},
    fromBlockSnapshot: {
      enter: async (o, context) => {
        const { configs, walker, walkerContext, job } = context;
        const type = configs.get('embedSyncedDocExportType');

        // this context is used for nested sync block
        if (
          walkerContext.getGlobalContext('embed-synced-doc-counter') ===
          undefined
        ) {
          walkerContext.setGlobalContext('embed-synced-doc-counter', 0);
        }
        let counter = walkerContext.getGlobalContext(
          'embed-synced-doc-counter'
        ) as number;
        walkerContext.setGlobalContext('embed-synced-doc-counter', ++counter);

        if (type === 'content') {
          const syncedDocId = o.node.props.pageId as string;
          const syncedDoc = job.docCRUD.get(syncedDocId);
          if (!syncedDoc) return;

          if (counter === 1) {
            const syncedSnapshot = job.docToSnapshot(syncedDoc);
            if (syncedSnapshot) {
              await walker.walkONode(syncedSnapshot.blocks);
            }
          } else {
            // TODO(@L-Sun) may be use the nested content
            walkerContext
              .openNode({
                type: 'paragraph',
                children: [
                  { type: 'text', value: syncedDoc.meta?.title ?? '' },
                ],
              })
              .closeNode();
          }
        }
      },
      leave: (_, context) => {
        const { walkerContext } = context;
        const counter = walkerContext.getGlobalContext(
          'embed-synced-doc-counter'
        ) as number;
        walkerContext.setGlobalContext('embed-synced-doc-counter', counter - 1);
      },
    },
  };

export const EmbedSyncedDocMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(embedSyncedDocBlockMarkdownAdapterMatcher);
