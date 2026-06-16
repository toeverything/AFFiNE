import type { SerializedXYWH } from '@blocksuite/global/gfx';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test, vi } from 'vitest';

import { effects } from '../../effects.js';
import { GfxControllerIdentifier } from '../../gfx/identifiers.js';
import type { GfxBlockElementModel } from '../../gfx/model/gfx-block-model.js';
import { getPostGestureRecoveryDelay } from '../../gfx/viewport.js';
import {
  GfxViewportElement,
  shouldUseLowZoomBlockSurvivalMode,
} from '../../gfx/viewport-element.js';
import type { GfxBlockComponent } from '../../view/element/gfx-block-component.js';
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

const getTestGfxBlockModel = (
  gfx: { getElementById: (id: string) => unknown },
  id: string
) => {
  const model = gfx.getElementById(id) as GfxBlockElementModel | null;
  if (!model) {
    throw new Error(`Missing gfx model for block ${id}`);
  }
  return model;
};

const getTestGfxBlockView = (
  gfx: { view: { get: (id: string) => unknown } },
  id: string
) => {
  const view = gfx.view.get(id) as GfxBlockComponent | null;
  if (!view) {
    throw new Error(`Missing gfx view for block ${id}`);
  }
  return view;
};

const getViewportChildBlockIds = (viewportElement: GfxViewportElement) =>
  [...viewportElement.children].map(
    child => (child as HTMLElement).dataset.blockId
  );

const setBlockXYWH = (
  gfx: { getElementById: (id: string) => unknown },
  id: string,
  xywh: SerializedXYWH
) => {
  const model = getTestGfxBlockModel(gfx, id);
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

  test('detects low-zoom DOM survival mode only during active gestures for gesture-safe viewport configs', () => {
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.4,
        skipRefreshDuringGesture: true,
        gestureActive: true,
      })
    ).toBe(true);
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.4,
        skipRefreshDuringGesture: true,
        gestureActive: false,
      })
    ).toBe(false);
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.6,
        skipRefreshDuringGesture: true,
        gestureActive: true,
      })
    ).toBe(false);
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.4,
        skipRefreshDuringGesture: false,
        gestureActive: true,
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

    const selectedModel = getTestGfxBlockModel(gfx, selectedId);
    const inViewportModel = getTestGfxBlockModel(gfx, inViewportId);
    const outOfViewportModel = getTestGfxBlockModel(gfx, outOfViewportId);
    const selectedView = getTestGfxBlockView(gfx, selectedId);
    const inViewportView = getTestGfxBlockView(gfx, inViewportId);
    const outOfViewportView = getTestGfxBlockView(gfx, outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(outOfViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel, inViewportModel]);
    (
      viewportElement as unknown as {
        _lastVisibleModels: Set<unknown>;
      }
    )._lastVisibleModels = new Set([
      selectedModel,
      inViewportModel,
      outOfViewportModel,
    ]);

    (
      viewportElement as unknown as {
        _hideOutsideAndNoSelectedBlock: () => void;
      }
    )._hideOutsideAndNoSelectedBlock();

    expect(selectedView.transformState$.value).toBe('active');
    expect(inViewportView.transformState$.value).toBe('survival');
    expect(outOfViewportView.transformState$.value).toBe('idle');
  });

  test('parks non-active low-zoom gesture blocks outside viewport DOM while gesture is running', async () => {
    const { editorContainer, gfx, surfaceId } = await commonSetup();
    const waitViewConnected = waitGfxViewConnected(gfx);

    const selectedId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const nearbyId = gfx.std.store.addBlock(
      'test:gfx-block',
      undefined,
      surfaceId
    );
    const farVisibleId = gfx.std.store.addBlock(
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
      waitViewConnected(nearbyId),
      waitViewConnected(farVisibleId),
      waitViewConnected(outOfViewportId),
    ]);

    setBlockXYWH(gfx, selectedId, '[0,0,10,10]');
    setBlockXYWH(gfx, nearbyId, '[20,0,10,10]');
    setBlockXYWH(gfx, farVisibleId, '[120,0,10,10]');
    setBlockXYWH(gfx, outOfViewportId, '[500,500,10,10]');

    const selectedModel = getTestGfxBlockModel(gfx, selectedId);
    const nearbyModel = getTestGfxBlockModel(gfx, nearbyId);
    const farVisibleModel = getTestGfxBlockModel(gfx, farVisibleId);
    const selectedView = getTestGfxBlockView(gfx, selectedId);
    const nearbyView = getTestGfxBlockView(gfx, nearbyId);
    const farVisibleView = getTestGfxBlockView(gfx, farVisibleId);
    const outOfViewportView = getTestGfxBlockView(gfx, outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(nearbyModel).not.toBeNull();
    expect(farVisibleModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(nearbyView).not.toBeNull();
    expect(farVisibleView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.LOW_ZOOM_GESTURE_ACTIVE_BLOCK_LIMIT = 1;

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

    gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);
    gfx.viewport.panning$.next(true);

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel, nearbyModel, farVisibleModel]);
    document.body.append(viewportElement);
    viewportElement.append(
      selectedView,
      nearbyView,
      farVisibleView,
      outOfViewportView
    );

    (
      viewportElement as unknown as {
        _hideOutsideAndNoSelectedBlock: () => void;
      }
    )._hideOutsideAndNoSelectedBlock();

    expect(getViewportChildBlockIds(viewportElement)).toEqual([
      selectedId,
      nearbyId,
    ]);
    expect(farVisibleView.isConnected).toBe(false);
    expect(outOfViewportView.isConnected).toBe(false);
  });

  test('restores parked low-zoom blocks after gesture recovery completes', async () => {
    vi.useFakeTimers();
    try {
      const { editorContainer, gfx, surfaceId } = await commonSetup();
      const waitViewConnected = waitGfxViewConnected(gfx);

      const firstId = gfx.std.store.addBlock(
        'test:gfx-block',
        undefined,
        surfaceId
      );
      const secondId = gfx.std.store.addBlock(
        'test:gfx-block',
        undefined,
        surfaceId
      );
      const thirdId = gfx.std.store.addBlock(
        'test:gfx-block',
        undefined,
        surfaceId
      );

      await Promise.all([
        waitViewConnected(firstId),
        waitViewConnected(secondId),
        waitViewConnected(thirdId),
      ]);

      setBlockXYWH(gfx, firstId, '[0,0,10,10]');
      setBlockXYWH(gfx, secondId, '[20,0,10,10]');
      setBlockXYWH(gfx, thirdId, '[40,0,10,10]');

      const firstModel = getTestGfxBlockModel(gfx, firstId);
      const secondModel = getTestGfxBlockModel(gfx, secondId);
      const thirdModel = getTestGfxBlockModel(gfx, thirdId);
      const firstView = getTestGfxBlockView(gfx, firstId);
      const secondView = getTestGfxBlockView(gfx, secondId);
      const thirdView = getTestGfxBlockView(gfx, thirdId);

      expect(firstModel).not.toBeNull();
      expect(secondModel).not.toBeNull();
      expect(thirdModel).not.toBeNull();
      expect(firstView).not.toBeNull();
      expect(secondView).not.toBeNull();
      expect(thirdView).not.toBeNull();

      gfx.selection.clear();
      gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
      gfx.viewport.LOW_ZOOM_GESTURE_ACTIVE_BLOCK_LIMIT = 1;

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

      gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);
      gfx.viewport.panning$.next(true);

      const viewportElement = new GfxViewportElement();
      viewportElement.host = editorContainer.std.host;
      viewportElement.viewport = gfx.viewport;
      viewportElement.getModelsInViewport = () =>
        new Set([firstModel, secondModel, thirdModel]);
      document.body.append(viewportElement);
      viewportElement.append(firstView, secondView, thirdView);

      (
        viewportElement as unknown as {
          _hideOutsideAndNoSelectedBlock: () => void;
        }
      )._hideOutsideAndNoSelectedBlock();

      expect(viewportElement.children).toHaveLength(1);

      gfx.viewport.panning$.next(false);
      await vi.advanceTimersByTimeAsync(1200);

      expect(new Set(getViewportChildBlockIds(viewportElement))).toEqual(
        new Set([firstId, secondId, thirdId])
      );
      expect(firstView.transformState$.value).toBe('active');
      expect(secondView.transformState$.value).toBe('active');
      expect(thirdView.transformState$.value).toBe('active');

      gfx.viewport.panning$.next(true);
      (
        viewportElement as unknown as {
          _hideOutsideAndNoSelectedBlock: () => void;
        }
      )._hideOutsideAndNoSelectedBlock();
      expect(viewportElement.children).toHaveLength(1);

      gfx.viewport.panning$.next(false);
      await vi.advanceTimersByTimeAsync(1200);

      expect(new Set(getViewportChildBlockIds(viewportElement))).toEqual(
        new Set([firstId, secondId, thirdId])
      );
      expect(firstView.transformState$.value).toBe('active');
      expect(secondView.transformState$.value).toBe('active');
      expect(thirdView.transformState$.value).toBe('active');
    } finally {
      vi.useRealTimers();
    }
  });

  test('programmatic low-zoom viewport changes do not arm gesture signals', async () => {
    const { Viewport } = await import('../../gfx/index.js');

    const viewport = new Viewport();
    viewport.SKIP_REFRESH_DURING_GESTURE = true;
    viewport.LOW_ZOOM_GESTURE_ACTIVE_BLOCK_LIMIT = 1;

    viewport.setViewport(0.4, [20, 0]);

    expect(viewport.panning$.value).toBe(false);
    expect(viewport.zooming$.value).toBe(false);
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: viewport.zoom,
        skipRefreshDuringGesture: viewport.SKIP_REFRESH_DURING_GESTURE,
        gestureActive: viewport.panning$.value || viewport.zooming$.value,
      })
    ).toBe(false);
  });

  test('programmatic low-zoom viewport changes still emit viewport updates', async () => {
    const { Viewport } = await import('../../gfx/index.js');

    const viewport = new Viewport();
    viewport.SKIP_REFRESH_DURING_GESTURE = true;

    const updates: Array<{ zoom: number; center: [number, number] }> = [];
    const subscription = viewport.viewportUpdated.subscribe(
      ({ zoom, center }) => {
        updates.push({ zoom, center: [center[0], center[1]] });
      }
    );

    viewport.setViewport(0.4, [20, 10]);

    subscription.unsubscribe();

    expect(updates).toEqual([
      {
        zoom: 0.4,
        center: [20, 10],
      },
    ]);
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

    const selectedModel = getTestGfxBlockModel(gfx, selectedId);
    const inViewportModel = getTestGfxBlockModel(gfx, inViewportId);
    const selectedView = getTestGfxBlockView(gfx, selectedId);
    const inViewportView = getTestGfxBlockView(gfx, inViewportId);
    const outOfViewportView = getTestGfxBlockView(gfx, outOfViewportId);

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
      new Set([selectedModel, inViewportModel]);

    (
      viewportElement as unknown as {
        _hideOutsideAndNoSelectedBlock: () => void;
      }
    )._hideOutsideAndNoSelectedBlock();

    expect(selectedView.transformState$.value).toBe('active');
    expect(inViewportView.transformState$.value).toBe('active');
    expect(outOfViewportView.transformState$.value).toBe('idle');
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

    const selectedModel = getTestGfxBlockModel(gfx, selectedId);
    const inViewportModel = getTestGfxBlockModel(gfx, inViewportId);
    const selectedView = getTestGfxBlockView(gfx, selectedId);
    const inViewportView = getTestGfxBlockView(gfx, inViewportId);
    const outOfViewportView = getTestGfxBlockView(gfx, outOfViewportId);

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
      new Set([selectedModel, inViewportModel]);

    (
      viewportElement as unknown as {
        _hideOutsideAndNoSelectedBlock: () => void;
      }
    )._hideOutsideAndNoSelectedBlock();

    expect(selectedView.transformState$.value).toBe('active');
    expect(inViewportView.transformState$.value).toBe('active');
    expect(outOfViewportView.transformState$.value).toBe('idle');

    document.body.append(viewportElement);
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);
    await Promise.resolve();

    expect(selectedView.transformState$.value).toBe('active');
    expect(inViewportView.transformState$.value).toBe('survival');
    expect(outOfViewportView.transformState$.value).toBe('idle');
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

    const selectedModel = getTestGfxBlockModel(gfx, selectedId);
    const inViewportModel = getTestGfxBlockModel(gfx, inViewportId);
    const selectedView = getTestGfxBlockView(gfx, selectedId);
    const inViewportView = getTestGfxBlockView(gfx, inViewportId);
    const outOfViewportView = getTestGfxBlockView(gfx, outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel, inViewportModel]);

    await new Promise<void>(resolve => {
      (
        viewportElement as unknown as {
          _chunkedHideOutsideAndNoSelectedBlock: (
            onComplete?: () => void
          ) => () => void;
        }
      )._chunkedHideOutsideAndNoSelectedBlock(resolve);
    });

    expect(selectedView.transformState$.value).toBe('active');
    expect(inViewportView.transformState$.value).toBe('survival');
    expect(outOfViewportView.transformState$.value).toBe('idle');
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

    const selectedModel = getTestGfxBlockModel(gfx, selectedId);
    const selectedView = getTestGfxBlockView(gfx, selectedId);

    expect(selectedModel).not.toBeNull();
    expect(selectedView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);

    const viewportModels = new Set([selectedModel]);
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

    const inViewportModel = getTestGfxBlockModel(gfx, inViewportId);
    const outOfViewportModel = getTestGfxBlockModel(gfx, outOfViewportId);

    expect(inViewportModel).not.toBeNull();
    expect(outOfViewportModel).not.toBeNull();

    viewportModels.add(inViewportModel);

    await Promise.all([
      waitViewConnected(inViewportId),
      waitViewConnected(outOfViewportId),
    ]);

    const inViewportView = getTestGfxBlockView(gfx, inViewportId);
    const outOfViewportView = getTestGfxBlockView(gfx, outOfViewportId);

    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();
    expect(selectedView.transformState$.value).toBe('active');
    expect(inViewportView.transformState$.value).toBe('survival');
    expect(outOfViewportView.transformState$.value).toBe('idle');
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

    const selectedModel = getTestGfxBlockModel(gfx, selectedId);
    const inViewportModel = getTestGfxBlockModel(gfx, inViewportId);
    const selectedView = getTestGfxBlockView(gfx, selectedId);
    const inViewportView = getTestGfxBlockView(gfx, inViewportId);
    const outOfViewportView = getTestGfxBlockView(gfx, outOfViewportId);

    expect(selectedModel).not.toBeNull();
    expect(inViewportModel).not.toBeNull();
    expect(selectedView).not.toBeNull();
    expect(inViewportView).not.toBeNull();
    expect(outOfViewportView).not.toBeNull();

    gfx.selection.set({ elements: [selectedId], editing: false });
    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;
    gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);

    const viewportElement = new GfxViewportElement();
    viewportElement.host = editorContainer.std.host;
    viewportElement.viewport = gfx.viewport;
    viewportElement.getModelsInViewport = () =>
      new Set([selectedModel, inViewportModel]);
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

    selectedView.transformState$.value = 'active';
    inViewportView.transformState$.value = 'active';
    outOfViewportView.transformState$.value = 'active';

    gfx.viewport.onResize();

    expect(selectedView.transformState$.value).toBe('active');
    expect(inViewportView.transformState$.value).toBe('survival');
    expect(outOfViewportView.transformState$.value).toBe('idle');
  });

  test('resize completion clears low-zoom gesture recovery before sizeUpdated subscribers run', async () => {
    const { gfx } = await commonSetup();

    gfx.viewport.SKIP_REFRESH_DURING_GESTURE = true;

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

    let panningAtSizeUpdated: boolean | null = null;
    let zoomingAtSizeUpdated: boolean | null = null;
    let blockSurvivalAtSizeUpdated: boolean | null = null;
    let canvasRecoveryDelayAtSizeUpdated: number | null = null;

    const subscription = gfx.viewport.sizeUpdated.subscribe(() => {
      const gestureActive =
        gfx.viewport.panning$.value || gfx.viewport.zooming$.value;

      panningAtSizeUpdated = gfx.viewport.panning$.value;
      zoomingAtSizeUpdated = gfx.viewport.zooming$.value;
      blockSurvivalAtSizeUpdated = shouldUseLowZoomBlockSurvivalMode({
        zoom: gfx.viewport.zoom,
        skipRefreshDuringGesture: gfx.viewport.SKIP_REFRESH_DURING_GESTURE,
        gestureActive,
      });
      canvasRecoveryDelayAtSizeUpdated = getPostGestureRecoveryDelay({
        isPanning: gfx.viewport.panning$.value,
        isZooming: gfx.viewport.zooming$.value,
        fallbackDelayMs: 800,
      });
    });

    gfx.viewport.setZoom(0.4, { x: 0, y: 0 }, false, true, true);
    gfx.viewport.onResize();

    await new Promise(resolve => setTimeout(resolve, 300));
    subscription.unsubscribe();

    expect(panningAtSizeUpdated).toBe(false);
    expect(zoomingAtSizeUpdated).toBe(false);
    expect(blockSurvivalAtSizeUpdated).toBe(false);
    expect(canvasRecoveryDelayAtSizeUpdated).toBe(0);
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
