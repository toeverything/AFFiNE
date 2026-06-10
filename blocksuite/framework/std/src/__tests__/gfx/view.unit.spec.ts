import type { SerializedXYWH } from '@blocksuite/global/gfx';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

import { effects } from '../../effects.js';
import { GfxControllerIdentifier } from '../../gfx/identifiers.js';
import {
  GfxViewportElement,
  shouldUseLowZoomBlockSurvivalMode,
} from '../../gfx/viewport-element.js';
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
    editorContainer,
    gfx,
    surfaceId,
    rootId,
    surfaceModel: surfaceBlock.model as SurfaceBlockModel,
  };
};

const waitGfxViewConnected = (gfx: {
  std: {
    view: {
      viewUpdated: {
        subscribe: (
          callback: (payload: {
            id: string;
            type: string;
            method: string;
          }) => void
        ) => { unsubscribe: () => void };
      };
    };
  };
}) => {
  return (id: string) => {
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
};

const setBlockXYWH = (
  gfx: { getElementById: (id: string) => { xywh: SerializedXYWH } | null },
  id: string,
  xywh: SerializedXYWH
) => {
  const model = gfx.getElementById(id);
  if (!model) {
    throw new Error(`Missing gfx model for block ${id}`);
  }
  model.xywh = xywh;
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
    const waitViewConnected = waitGfxViewConnected(gfx);

    const id = gfx.std.store.addBlock('test:gfx-block', undefined, surfaceId);
    await waitViewConnected(id);
    const gfxBlockView = gfx.view.get(id);
    expect(gfxBlockView).not.toBeNull();

    const rootView = gfx.view.get(rootId);
    // root is not a gfx block, so it should be null
    expect(rootView).toBeNull();
  });

  test('detects low-zoom DOM survival mode for gesture-safe viewport configs', () => {
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.4,
        skipRefreshDuringGesture: true,
      })
    ).toBe(true);
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.6,
        skipRefreshDuringGesture: true,
      })
    ).toBe(false);
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.4,
        skipRefreshDuringGesture: false,
      })
    ).toBe(false);
  });

  test('keeps selected block active while degrading unselected low-zoom viewport blocks', async () => {
    const { editorContainer, gfx, surfaceId } = await commonSetup();
    const waitViewConnected = waitGfxViewConnected(gfx);

    const selectedId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const inViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const outOfViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );

    await Promise.all([
      waitViewConnected(selectedId),
      waitViewConnected(inViewportId),
      waitViewConnected(outOfViewportId),
    ]);

    setBlockXYWH(gfx, selectedId, '[0,0,10,10]');
    setBlockXYWH(gfx, inViewportId, '[20,0,10,10]');
    setBlockXYWH(gfx, outOfViewportId, '[500,500,10,10]');

    const selectedModel = gfx.getElementById(selectedId);
    const inViewportModel = gfx.getElementById(inViewportId);
    const outOfViewportModel = gfx.getElementById(outOfViewportId);
    const selectedView = gfx.view.get(selectedId);
    const inViewportView = gfx.view.get(inViewportId);
    const outOfViewportView = gfx.view.get(outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(outOfViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 });

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel!, inViewportModel!]);
    (
      viewportElement as unknown as {
        _lastVisibleModels: Set<unknown>;
      }
    )._lastVisibleModels = new Set([
      selectedModel!,
      inViewportModel!,
      outOfViewportModel!,
    ]);

    (
      viewportElement as unknown as {
        _hideOutsideAndNoSelectedBlock: () => void;
      }
    )._hideOutsideAndNoSelectedBlock();

    expect(selectedView!.transformState$.value).toBe('active');
    expect(inViewportView!.transformState$.value).toBe('survival');
    expect(outOfViewportView!.transformState$.value).toBe('idle');
  });

  test('idles out-of-viewport blocks on the first visibility refresh', async () => {
    const { editorContainer, gfx, surfaceId } = await commonSetup();
    const waitViewConnected = waitGfxViewConnected(gfx);

    const selectedId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const inViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const outOfViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );

    await Promise.all([
      waitViewConnected(selectedId),
      waitViewConnected(inViewportId),
      waitViewConnected(outOfViewportId),
    ]);

    setBlockXYWH(gfx, selectedId, '[0,0,10,10]');
    setBlockXYWH(gfx, inViewportId, '[20,0,10,10]');
    setBlockXYWH(gfx, outOfViewportId, '[500,500,10,10]');

    const selectedModel = gfx.getElementById(selectedId);
    const inViewportModel = gfx.getElementById(inViewportId);
    const selectedView = gfx.view.get(selectedId);
    const inViewportView = gfx.view.get(inViewportId);
    const outOfViewportView = gfx.view.get(outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel!, inViewportModel!]);

    (
      viewportElement as unknown as {
        _hideOutsideAndNoSelectedBlock: () => void;
      }
    )._hideOutsideAndNoSelectedBlock();

    expect(selectedView!.transformState$.value).toBe('active');
    expect(inViewportView!.transformState$.value).toBe('active');
    expect(outOfViewportView!.transformState$.value).toBe('idle');
  });

  test('demotes visible unselected blocks immediately when zoom crosses into survival mode', async () => {
    const { editorContainer, gfx, surfaceId } = await commonSetup();
    const waitViewConnected = waitGfxViewConnected(gfx);

    const selectedId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const inViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const outOfViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );

    await Promise.all([
      waitViewConnected(selectedId),
      waitViewConnected(inViewportId),
      waitViewConnected(outOfViewportId),
    ]);

    setBlockXYWH(gfx, selectedId, '[0,0,10,10]');
    setBlockXYWH(gfx, inViewportId, '[20,0,10,10]');
    setBlockXYWH(gfx, outOfViewportId, '[500,500,10,10]');

    const selectedModel = gfx.getElementById(selectedId);
    const inViewportModel = gfx.getElementById(inViewportId);
    const selectedView = gfx.view.get(selectedId);
    const inViewportView = gfx.view.get(inViewportId);
    const outOfViewportView = gfx.view.get(outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel!, inViewportModel!]);

    (
      viewportElement as unknown as {
        _hideOutsideAndNoSelectedBlock: () => void;
      }
    )._hideOutsideAndNoSelectedBlock();

    expect(selectedView!.transformState$.value).toBe('active');
    expect(inViewportView!.transformState$.value).toBe('active');
    expect(outOfViewportView!.transformState$.value).toBe('idle');

    document.body.append(viewportElement);
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 });
    await Promise.resolve();

    expect(selectedView!.transformState$.value).toBe('active');
    expect(inViewportView!.transformState$.value).toBe('survival');
    expect(outOfViewportView!.transformState$.value).toBe('idle');
  });

  test('chunked low-zoom refresh idles out-of-viewport blocks on the first pass', async () => {
    const { editorContainer, gfx, surfaceId } = await commonSetup();
    const waitViewConnected = waitGfxViewConnected(gfx);

    const selectedId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const inViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const outOfViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );

    await Promise.all([
      waitViewConnected(selectedId),
      waitViewConnected(inViewportId),
      waitViewConnected(outOfViewportId),
    ]);

    setBlockXYWH(gfx, selectedId, '[0,0,10,10]');
    setBlockXYWH(gfx, inViewportId, '[20,0,10,10]');
    setBlockXYWH(gfx, outOfViewportId, '[500,500,10,10]');

    const selectedModel = gfx.getElementById(selectedId);
    const inViewportModel = gfx.getElementById(inViewportId);
    const selectedView = gfx.view.get(selectedId);
    const inViewportView = gfx.view.get(inViewportId);
    const outOfViewportView = gfx.view.get(outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 });

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel!, inViewportModel!]);

    await new Promise<void>(resolve => {
      (
        viewportElement as unknown as {
          _chunkedHideOutsideAndNoSelectedBlock: (
            onComplete?: () => void
          ) => () => void;
        }
      )._chunkedHideOutsideAndNoSelectedBlock(resolve);
    });

    expect(selectedView!.transformState$.value).toBe('active');
    expect(inViewportView!.transformState$.value).toBe('survival');
    expect(outOfViewportView!.transformState$.value).toBe('idle');
  });

  test('newly mounted blocks inherit the current low-zoom visibility state', async () => {
    const { editorContainer, gfx, surfaceId } = await commonSetup();
    const waitViewConnected = waitGfxViewConnected(gfx);

    const selectedId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    await waitViewConnected(selectedId);
    setBlockXYWH(gfx, selectedId, '[0,0,10,10]');

    const selectedModel = gfx.getElementById(selectedId);
    const selectedView = gfx.view.get(selectedId);

    expect(selectedModel).not.toBeNull();
    expect(selectedView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 });

    const viewportModels = new Set([selectedModel!]);
    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () => viewportModels;
    document.body.append(viewportElement);

    const inViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const outOfViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );

    setBlockXYWH(gfx, inViewportId, '[20,0,10,10]');
    setBlockXYWH(gfx, outOfViewportId, '[500,500,10,10]');

    const inViewportModel = gfx.getElementById(inViewportId);
    const outOfViewportModel = gfx.getElementById(outOfViewportId);

    expect(inViewportModel).not.toBeNull();
    expect(outOfViewportModel).not.toBeNull();

    viewportModels.add(inViewportModel!);

    await Promise.all([
      waitViewConnected(inViewportId),
      waitViewConnected(outOfViewportId),
    ]);

    const inViewportView = gfx.view.get(inViewportId);
    const outOfViewportView = gfx.view.get(outOfViewportId);

    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();
    expect(selectedView!.transformState$.value).toBe('active');
    expect(inViewportView!.transformState$.value).toBe('survival');
    expect(outOfViewportView!.transformState$.value).toBe('idle');
  });

  test('demotes stale active blocks immediately when low-zoom resize starts', async () => {
    const { editorContainer, gfx, surfaceId } = await commonSetup();
    const waitViewConnected = waitGfxViewConnected(gfx);

    const selectedId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const inViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const outOfViewportId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );

    await Promise.all([
      waitViewConnected(selectedId),
      waitViewConnected(inViewportId),
      waitViewConnected(outOfViewportId),
    ]);

    setBlockXYWH(gfx, selectedId, '[0,0,10,10]');
    setBlockXYWH(gfx, inViewportId, '[20,0,10,10]');
    setBlockXYWH(gfx, outOfViewportId, '[500,500,10,10]');

    const selectedModel = gfx.getElementById(selectedId);
    const inViewportModel = gfx.getElementById(inViewportId);
    const selectedView = gfx.view.get(selectedId);
    const inViewportView = gfx.view.get(inViewportId);
    const outOfViewportView = gfx.view.get(outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 });

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel!, inViewportModel!]);
    document.body.append(viewportElement);

    const shell = document.createElement('div');
    Object.defineProperty(shell, 'offsetWidth', {
      configurable: true,
      get: () => 844,
    });
    shell.getBoundingClientRect = () => new DOMRect(0, 0, 844, 390);
    (
      gfx.viewport as unknown as {
        _shell: HTMLElement;
        _cachedBoundingClientRect: DOMRect;
        _cachedOffsetWidth: number;
      }
    )._shell = shell;
    (
      gfx.viewport as unknown as {
        _shell: HTMLElement;
        _cachedBoundingClientRect: DOMRect;
        _cachedOffsetWidth: number;
      }
    )._cachedBoundingClientRect = new DOMRect(0, 0, 844, 390);
    (
      gfx.viewport as unknown as {
        _shell: HTMLElement;
        _cachedBoundingClientRect: DOMRect;
        _cachedOffsetWidth: number;
      }
    )._cachedOffsetWidth = 844;

    selectedView!.transformState$.value = 'active';
    inViewportView!.transformState$.value = 'active';
    outOfViewportView!.transformState$.value = 'active';

    gfx.viewport.onResize();

    expect(selectedView!.transformState$.value).toBe('active');
    expect(inViewportView!.transformState$.value).toBe('survival');
    expect(outOfViewportView!.transformState$.value).toBe('idle');
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
