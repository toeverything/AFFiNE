/**
 * Please refer to integration-test/README.md for commands to run tests.
 */
import { ParagraphLayoutHandlerExtension } from '@blocksuite/affine/blocks/paragraph';
import { noop } from '@blocksuite/affine/global/utils';
import {
  TurboRendererConfigFactory,
  ViewportTurboRendererExtension,
} from '@blocksuite/affine-gfx-turbo-renderer';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addSampleNotes } from '../utils/doc-generator.js';
import {
  createPainterWorker,
  getRenderer,
  setupEditor,
} from '../utils/setup.js';

const FRAME = 16;

describe('viewport turbo renderer', () => {
  let cleanup: () => void;

  beforeEach(async () => {
    cleanup = await setupEditor('edgeless', [
      ParagraphLayoutHandlerExtension,
      TurboRendererConfigFactory({
        painterWorkerEntry: createPainterWorker,
      }),
      ViewportTurboRendererExtension,
    ]);
    return cleanup;
  });

  afterEach(() => cleanup?.());

  test('should access turbo renderer instance', async () => {
    const renderer = getRenderer();
    expect(renderer).toBeDefined();
    expect(renderer instanceof ViewportTurboRendererExtension).toBe(true);
    expect(renderer.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  test('initial state should be pending', async () => {
    const renderer = getRenderer();
    expect(renderer.state$.value).toBe('pending');
  });

  test.skip('zooming should change internal state and populate optimized block ids', async () => {
    const renderer = getRenderer();
    addSampleNotes(doc, 1);
    await wait(FRAME);
    expect(renderer.optimizedBlockIds.length).toBe(0);

    renderer.viewport.zooming$.next(true);
    const nextState = await firstValueFrom(renderer.state$);
    expect(nextState).toBe('zooming');

    const canUseCache = renderer.canUseBitmapCache();
    expect(canUseCache).toBe(false);

    await renderer.refresh();
    await wait(FRAME);
    expect(renderer.optimizedBlockIds.length).toBe(1);

    renderer.viewport.zooming$.next(false);
    await wait(renderer.options.debounceTime + 100);

    expect(renderer.state$.value).not.toBe('zooming');
    expect(renderer.optimizedBlockIds.length).toBe(0);
  });

  test.skip('state transitions between pending and ready', async () => {
    const renderer = getRenderer();

    addSampleNotes(doc, 1);
    await wait(FRAME);
    expect(renderer.state$.value).toBe('pending');

    // Ensure zooming is off and wait for debounce + buffer
    renderer.viewport.zooming$.next(false);
    await wait(renderer.options.debounceTime + 500);
    expect(renderer.state$.value).toBe('ready');
  });

  test('initial layout cache data should be null', () => {
    const renderer = getRenderer();
    expect(renderer.layoutCacheData).toBeNull();
  });

  test('invalidation should reset layout cache data to null', async () => {
    const renderer = getRenderer();
    addSampleNotes(doc, 1);
    await wait(100);

    // Access getter to populate cache
    const _cache = renderer.layoutCache;
    noop(_cache);
    expect(renderer.layoutCacheData).not.toBeNull();

    // Invalidate
    addSampleNotes(doc, 1);
    await wait(100);

    expect(renderer.layoutCacheData).toBeNull();
  });

  test('accessing layoutCache getter should populate cache data', async () => {
    const renderer = getRenderer();
    addSampleNotes(doc, 1);
    await wait(FRAME);
    expect(renderer.layoutCacheData).toBeNull();

    const _cache = renderer.layoutCache;
    noop(_cache);
    expect(renderer.layoutCacheData).not.toBeNull();
    expect(renderer.layoutCache?.roots.length).toBeGreaterThan(0);
  });
});
