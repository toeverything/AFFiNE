import { Text, type Workspace } from '@blocksuite/affine/store';

import { createTestEditor } from '../utils/extensions.js';
import type { InitFn } from './utils.js';

export const multiEditor: InitFn = (collection: Workspace, id: string) => {
  const doc = collection.createDoc(id).getStore({ id });
  doc.load(() => {
    // Add root block and surface block at root level
    const rootId = doc.addBlock('affine:page', {
      title: new Text(),
    });

    doc.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    const noteId = doc.addBlock('affine:note', {}, rootId);
    // Add paragraph block inside note block
    doc.addBlock('affine:paragraph', {}, noteId);
  });

  doc.resetHistory();

  const app = document.getElementById('app');
  if (app) {
    const editor = createTestEditor(doc, collection);
    editor.style.borderRight = '1px solid var(--affine-border-color)';

    app.append(editor);
    app.style.display = 'flex';
  }
};

multiEditor.id = 'multiple-editor';
multiEditor.displayName = 'Multiple Editor Example';
multiEditor.description = 'Multiple Editor basic example';

export const multiEditorVertical: InitFn = (
  collection: Workspace,
  docId: string
) => {
  const doc = collection.createDoc(docId).getStore();
  doc.load(() => {
    // Add root block and surface block at root level
    const rootId = doc.addBlock('affine:page', {
      title: new Text(),
    });

    doc.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    const noteId = doc.addBlock('affine:note', {}, rootId);
    // Add paragraph block inside note block
    doc.addBlock('affine:paragraph', {}, noteId);
  });

  doc.resetHistory();

  const app = document.getElementById('app');
  if (app) {
    const editor = createTestEditor(doc, collection);
    editor.style.borderBottom = '1px solid var(--affine-border-color)';

    app.append(editor);
    app.style.display = 'flex';
    app.style.flexDirection = 'column';
  }
};

multiEditorVertical.id = 'multiple-editor-vertical';
multiEditorVertical.displayName = 'Vertical Multiple Editor Example';
multiEditorVertical.description = 'Multiple Editor vertical layout example';
