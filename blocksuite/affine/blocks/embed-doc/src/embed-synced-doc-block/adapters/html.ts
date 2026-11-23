import { EmbedSyncedDocBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

export const embedSyncedDocBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
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
        walkerContext.getGlobalContext('embed-synced-doc-counter') === undefined
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
        walkerContext.setGlobalContext('hast:html-root-doc', false);
        if (!syncedDoc) return;

        if (counter === 1) {
          const syncedSnapshot = job.docToSnapshot(syncedDoc);
          if (syncedSnapshot) {
            await walker.walkONode(syncedSnapshot.blocks);
          }
        } else {
          walkerContext
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-paragraph-block-container'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: [
                  { type: 'text', value: syncedDoc.meta?.title ?? '' },
                ],
              },
              'children'
            )
            .closeNode()
            .closeNode();
        }
      }
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      const counter = walkerContext.getGlobalContext(
        'embed-synced-doc-counter'
      ) as number;
      const currentCounter = counter - 1;
      walkerContext.setGlobalContext(
        'embed-synced-doc-counter',
        currentCounter
      );
      // When leave the last embed synced doc block, we need to set the html root doc context to true
      walkerContext.setGlobalContext(
        'hast:html-root-doc',
        currentCounter === 0
      );
    },
  },
};

export const EmbedSyncedDocBlockHtmlAdapterExtension =
  BlockHtmlAdapterExtension(embedSyncedDocBlockHtmlAdapterMatcher);
