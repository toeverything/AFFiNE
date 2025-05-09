import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

import { effects } from '../../effects.js';
import { GfxControllerIdentifier } from '../../gfx/identifiers.js';
import { TestEditorContainer } from '../test-editor.js';
import { TestLocalElement } from '../test-gfx-element.js';
import {
  RootBlockSchemaExtension,
  type SurfaceBlockModel,
  SurfaceBlockSchemaExtension,
  TestGfxBlockSchemaExtension,
} from '../test-schema.js';
import { testSpecs } from '../test-spec.js';

effects();

const extensions = [
  RootBlockSchemaExtension,
  SurfaceBlockSchemaExtension,
  TestGfxBlockSchemaExtension,
];

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

const commonSetup = async () => {
  const collection = new TestWorkspace(createTestOptions());

  collection.meta.initialize();
  const doc = collection.createDoc('home');
  const store = doc.getStore({ extensions });
  doc.load();

  const rootId = store.addBlock('test:page');
  const surfaceId = store.addBlock('test:surface', {}, rootId);

  const surfaceBlock = store.getBlock(surfaceId)!;

  const editorContainer = new TestEditorContainer();
  editorContainer.doc = store;
  editorContainer.specs = testSpecs;
  document.body.append(editorContainer);

  await editorContainer.updateComplete;

  const gfx = editorContainer.std.get(GfxControllerIdentifier);

  return {
    gfx,
    surfaceId,
    rootId,
    surfaceModel: surfaceBlock.model as SurfaceBlockModel,
  };
};

describe('gfx element view basic', () => {
  test('view should be created', async () => {
    const { gfx, surfaceModel } = await commonSetup();

    const id = surfaceModel.addElement({
      type: 'testShape',
    });
    const shapeView = gfx.view.get(id);

    expect(shapeView).not.toBeNull();
    expect(shapeView!.model.id).toBe(id);
    expect(shapeView!.isConnected).toBe(true);
  });

  test('view should be removed', async () => {
    const { gfx, surfaceModel } = await commonSetup();

    const id = surfaceModel.addElement({
      type: 'testShape',
    });
    const shapeView = gfx.view.get(id);

    expect(shapeView).not.toBeNull();
    expect(shapeView!.model.id).toBe(id);

    surfaceModel.deleteElement(id);
    expect(gfx.view.get(id)).toBeNull();
    expect(shapeView!.isConnected).toBe(false);
  });

  test('query gfx block view should work', async () => {
    const { gfx, surfaceId, rootId } = await commonSetup();

    const waitGfxViewConnected = (id: string) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      const subscription = gfx.std.view.viewUpdated.subscribe(payload => {
        if (
          payload.id === id &&
          payload.type === 'block' &&
          payload.method === 'add'
        ) {
          subscription.unsubscribe();
          resolve();
        }
      });

      return promise;
    };
    const id = gfx.std.store.addBlock('test:gfx-block', undefined, surfaceId);
    await waitGfxViewConnected(id);
    const gfxBlockView = gfx.view.get(id);
    expect(gfxBlockView).not.toBeNull();

    const rootView = gfx.view.get(rootId);
    // root is not a gfx block, so it should be null
    expect(rootView).toBeNull();
  });

  test('local element view should be created', async () => {
    const { gfx, surfaceModel } = await commonSetup();
    const localElement = new TestLocalElement(surfaceModel);
    localElement.id = 'test-local-element';

    surfaceModel.addLocalElement(localElement);

    const localView = gfx.view.get(localElement);
    expect(localView).not.toBeNull();
    expect(localView!.isConnected).toBe(true);

    surfaceModel.deleteLocalElement(localElement);
    expect(localView!.isConnected).toBe(false);
  });
});
