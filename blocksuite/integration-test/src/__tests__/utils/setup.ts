import '@toeverything/theme/style.css';
import '@toeverything/theme/fonts.css';

import { effects as blocksEffects } from '@blocksuite/affine/effects';
import type { ExtensionType, Store, Transformer } from '@blocksuite/store';

import { effects } from '../../effects.js';

blocksEffects();
effects();

import {
  EdgelessEditorBlockSpecs,
  PageEditorBlockSpecs,
  StoreExtensions,
} from '@blocksuite/affine/extensions';
import type { DocMode } from '@blocksuite/affine/model';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import {
  CommunityCanvasTextFonts,
  FontConfigExtension,
} from '@blocksuite/affine/shared/services';
import type { ViewportTurboRendererExtension } from '@blocksuite/affine-gfx-turbo-renderer';
import { Schema, Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';

import { TestAffineEditorContainer } from '../../index.js';

function createCollectionOptions() {
  const schema = new Schema();
  const room = Math.random().toString(16).slice(2, 8);

  schema.register(AffineSchemas);

  const idGenerator = createAutoIncrementIdGenerator();

  return {
    id: room,
    schema,
    idGenerator,
    defaultFlags: {
      readonly: {
        'doc:home': false,
      },
    },
  };
}

function initCollection(collection: TestWorkspace) {
  const doc = collection.createDoc('doc:home').getStore();

  doc.load(() => {
    const rootId = doc.addBlock('affine:page', {
      title: new Text(),
    });
    doc.addBlock('affine:surface', {}, rootId);
  });
  doc.resetHistory();
}

async function createEditor(
  collection: TestWorkspace,
  mode: DocMode = 'page',
  extensions: ExtensionType[] = []
) {
  const app = document.createElement('div');
  const blockCollection = collection.docs.values().next().value;
  if (!blockCollection) {
    throw new Error('Need to create a doc first');
  }
  const doc = blockCollection.getStore();
  const editor = new TestAffineEditorContainer();
  editor.doc = doc;
  editor.mode = mode;
  editor.pageSpecs = [
    ...PageEditorBlockSpecs,
    FontConfigExtension(CommunityCanvasTextFonts),
    ...extensions,
  ];
  editor.edgelessSpecs = [
    ...EdgelessEditorBlockSpecs,
    FontConfigExtension(CommunityCanvasTextFonts),
    ...extensions,
  ];
  app.append(editor);

  window.editor = editor;
  window.doc = doc;

  app.style.width = '100%';
  app.style.height = '1280px';
  app.style.overflowY = 'auto';

  document.body.append(app);
  await editor.updateComplete;
  return app;
}

export function createPainterWorker() {
  const worker = new Worker(
    new URL('./turbo-painter-entry.worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );
  return worker;
}

export async function setupEditor(
  mode: DocMode = 'page',
  extensions: ExtensionType[] = []
) {
  const collection = new TestWorkspace(createCollectionOptions());
  collection.storeExtensions = StoreExtensions;
  collection.meta.initialize();

  window.collection = collection;

  initCollection(collection);
  const appElement = await createEditor(collection, mode, extensions);

  return () => {
    appElement.remove();
    cleanup();
  };
}

export function cleanup() {
  window.editor.remove();

  delete (window as any).collection;

  delete (window as any).editor;

  delete (window as any).doc;
}

declare global {
  const editor: TestAffineEditorContainer;
  const doc: Store;
  const collection: TestWorkspace;
  const job: Transformer;
  interface Window {
    editor: TestAffineEditorContainer;
    doc: Store;
    job: Transformer;
    collection: TestWorkspace;
    renderer: ViewportTurboRendererExtension;
  }
}
