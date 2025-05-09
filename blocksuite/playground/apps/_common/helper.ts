import { TestWorkspace } from '@blocksuite/affine/store/test';
import { getTestStoreManager } from '@blocksuite/integration-test/store';

export function createEmptyDoc() {
  const collection = new TestWorkspace();
  collection.storeExtensions = getTestStoreManager().get('store');
  collection.meta.initialize();
  const doc = collection.createDoc();
  const store = doc.getStore();

  return {
    doc,
    init() {
      doc.load();
      const rootId = store.addBlock('affine:page', {});
      store.addBlock('affine:surface', {}, rootId);
      const noteId = store.addBlock('affine:note', {}, rootId);
      store.addBlock('affine:paragraph', {}, noteId);
      return store;
    },
  };
}
