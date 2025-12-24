import type {
  EmbedSyncedDocBlockProps,
  NoteBlockModel,
  ParagraphProps,
  RootBlockProps,
} from '@blocksuite/affine-model';
import type { Store } from '@blocksuite/store';
import type { Page } from '@playwright/test';
/**
 * using page.evaluate to init the embed synced doc state
 * @param page - playwright page
 * @param data.title - the title of the doc
 * @param data.content - the content of the doc
 * @param data.inEdgeless - whether this doc is in parent doc's canvas, default is in page
 * @param option.chain - doc1 -> doc2 -> doc3 -> ..., if chain is false, doc1 will be the parent of remaining docs
 * @returns the ids of created docs
 */
export async function initEmbedSyncedDocState(
  page: Page,
  data: { title: string; content: string; inEdgeless?: boolean }[],
  option?: {
    chain?: boolean;
  }
) {
  if (data.length === 0) {
    throw new Error('Data is empty');
  }

  return await page.evaluate(
    async ({ data, option }) => {
      const createDoc = async (
        docId: string,
        title: string,
        content: string
      ) => {
        const { collection, $blocksuite } = window;
        const Text = $blocksuite.store.Text;

        const store = (
          collection.getDoc(docId) ?? collection.createDoc(docId)
        ).getStore();
        store.load();

        const rootId = store.addBlock('affine:page', {
          title: new Text(title),
        } satisfies Partial<RootBlockProps>);

        store.addBlock('affine:surface', {}, rootId);

        const noteId = store.addBlock('affine:note', {}, rootId);
        store.addBlock(
          'affine:paragraph',
          {
            text: new Text(content),
          } satisfies Partial<ParagraphProps>,
          noteId
        );
      };

      const getVisibleNote = (store: Store) => {
        const note = store
          .getModelsByFlavour('affine:note')
          .find((note): note is NoteBlockModel => {
            return (
              note instanceof NoteBlockModel &&
              note.props.displayMode === NoteDisplayMode.DocAndEdgeless
            );
          });
        return note ?? null;
      };

      const docIds = await Promise.all(
        data.map(async ({ title, content }, index) => {
          const id = index === 0 ? window.doc.id : `embed-doc-${index}`;
          await createDoc(id, title, content);
          return id;
        })
      );

      const { NoteBlockModel, NoteDisplayMode } =
        window.$blocksuite.affineModel;

      let prevId = window.doc.id;
      for (let index = 1; index < docIds.length; index++) {
        const docId = docIds[index];

        const store = window.collection
          .getDoc(option?.chain ? prevId : docIds[0])
          ?.getStore();
        if (!store) {
          throw new Error('Store not found');
        }

        const note = getVisibleNote(store);
        if (!note) {
          throw new Error(`Note not found in ${docId}`);
        }

        const surface = store.getModelsByFlavour('affine:surface')[0];
        if (!surface) {
          throw new Error(`Surface not found in ${docId}`);
        }

        store.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: docId,
            xywh: '[0, 100, 370, 100]',
          } satisfies Partial<EmbedSyncedDocBlockProps>,
          data[index].inEdgeless ? surface.id : note.id
        );

        prevId = docId;
      }

      return docIds;
    },
    { data, option }
  );
}
