import { EmbedSyncedDocBlockSchema } from '@blocksuite/affine-model';
import {
  BlockPlainTextAdapterExtension,
  type BlockPlainTextAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

export const embedSyncedDocBlockPlainTextAdapterMatcher: BlockPlainTextAdapterMatcher =
  {
    flavour: EmbedSyncedDocBlockSchema.model.flavour,
    toMatch: () => false,
    fromMatch: o => o.node.flavour === EmbedSyncedDocBlockSchema.model.flavour,
    toBlockSnapshot: {},
    fromBlockSnapshot: {
      enter: async (o, context) => {
        const { configs, walker, walkerContext, job, textBuffer } = context;
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

        let buffer = '';

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
            buffer = syncedDoc.meta?.title ?? '';
            if (buffer) {
              buffer += '\n';
            }
          }
        }
        textBuffer.content += buffer;
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

export const EmbedSyncedDocBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(embedSyncedDocBlockPlainTextAdapterMatcher);
