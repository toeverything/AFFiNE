import { SpecProvider } from '@blocksuite/affine/shared/utils';
import { TestWorkspace } from '@blocksuite/affine/store/test';

export function createEmptyDoc() {
  const collection = new TestWorkspace();
  collection.storeExtensions = SpecProvider._.getSpec('store').value;
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
