import type { DocModeProvider } from '@blocksuite/affine/shared/services';
import type { Doc, Store, Workspace } from '@blocksuite/affine/store';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';

export function getDocFromUrlParams(collection: Workspace, url: URL) {
  let doc: Store | null = null;

  const docId = decodeURIComponent(url.hash.slice(1));

  if (docId) {
    doc = collection.getDoc(docId)?.getStore() ?? null;
  }
  if (!doc) {
    const blockCollection = collection.docs.values().next().value as Doc;
    if (!blockCollection) {
      throw new Error('Need to create a doc first');
    }
    doc = blockCollection.getStore();
  }

  doc.load();
  doc.resetHistory();

  if (!doc.root) {
    throw new Error('Doc root is not ready');
  }

  return doc;
}

export function setDocModeFromUrlParams(
  service: DocModeProvider,
  search: URLSearchParams,
  docId: string
) {
  const paramMode = search.get('mode');
  if (paramMode) {
    const docMode = paramMode === 'page' ? 'page' : 'edgeless';
    service.setPrimaryMode(docMode, docId);
    service.setEditorMode(docMode);
  }
}

export function listenHashChange(
  collection: Workspace,
  editor: TestAffineEditorContainer
) {
  const panel = document.querySelector('docs-panel');
  window.addEventListener('hashchange', () => {
    const url = new URL(location.toString());
    const doc = getDocFromUrlParams(collection, url);
    if (!doc) return;

    if (panel?.checkVisibility()) {
      panel.requestUpdate();
    }

    editor.doc = doc;
    editor.doc.load();
    editor.doc.resetHistory();
  });
}
