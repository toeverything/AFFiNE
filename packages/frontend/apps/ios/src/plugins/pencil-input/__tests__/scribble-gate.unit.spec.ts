// eslint-disable-next-line import-x/no-extraneous-dependencies
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  collectEditableScribbleRects,
  createStickyScribbleRects,
  disposeScribbleProxyTextareas,
  focusNearestEditableScribbleTarget,
  syncScribbleProxyTextareas,
} from '../scribble-gate';

afterEach(() => {
  disposeScribbleProxyTextareas(document);
  document.body.replaceChildren();
});

describe('collectEditableScribbleRects', () => {
  test('collects visible native input and inline editor rects', () => {
    const input = document.createElement('input');
    const inlineEditor = document.createElement('div');
    inlineEditor.dataset.vRoot = 'true';
    inlineEditor.contentEditable = 'true';
    document.body.append(input, inlineEditor);

    input.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 100,
        height: 30,
        right: 110,
        bottom: 50,
      }) as DOMRect;
    inlineEditor.getBoundingClientRect = () =>
      ({
        left: 30,
        top: 60,
        width: 200,
        height: 40,
        right: 230,
        bottom: 100,
      }) as DOMRect;

    expect(collectEditableScribbleRects(document)).toEqual([
      { x: 10, y: 20, width: 100, height: 30 },
      { x: 30, y: 96, width: 360, height: 28 },
      { x: -190, y: 124, width: 580, height: 156 },
    ]);
  });

  test('ignores disabled inputs and editable page roots', () => {
    const input = document.createElement('input');
    input.disabled = true;
    const pageRoot = document.createElement('div');
    pageRoot.contentEditable = 'true';
    document.body.append(input, pageRoot);

    input.getBoundingClientRect = pageRoot.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 100,
        height: 30,
        right: 110,
        bottom: 50,
      }) as DOMRect;

    expect(collectEditableScribbleRects(document)).toEqual([]);
  });
});

describe('createStickyScribbleRects', () => {
  test('keeps the last editable rects during the post-input remount gap', () => {
    let now = 1000;
    const stickyRects = createStickyScribbleRects({
      now: () => now,
      ttl: 2500,
    });
    const rects = [{ x: 10, y: 20, width: 100, height: 30 }];

    expect(stickyRects(rects)).toEqual({ rects, sticky: false });

    now = 2000;
    expect(stickyRects([])).toEqual({ rects, sticky: true });

    now = 3600;
    expect(stickyRects([])).toEqual({ rects: [], sticky: false });
  });
});

describe('focusNearestEditableScribbleTarget', () => {
  test('focuses an inline editor when Scribble starts in the expanded lower-left area', () => {
    const inlineEditor = document.createElement('div');
    inlineEditor.dataset.vRoot = 'true';
    inlineEditor.contentEditable = 'true';
    inlineEditor.tabIndex = -1;
    document.body.append(inlineEditor);

    inlineEditor.getBoundingClientRect = () =>
      ({
        left: 430,
        top: 380,
        width: 120,
        height: 40,
        right: 550,
        bottom: 420,
      }) as DOMRect;

    expect(
      focusNearestEditableScribbleTarget({ x: 235, y: 523 }, document)
    ).toBe(true);
    expect(document.activeElement).toBe(inlineEditor);
  });

  test('does not focus an inline editor from the top-left chrome area', () => {
    const inlineEditor = document.createElement('div');
    inlineEditor.dataset.vRoot = 'true';
    inlineEditor.contentEditable = 'true';
    inlineEditor.tabIndex = -1;
    document.body.append(inlineEditor);

    inlineEditor.getBoundingClientRect = () =>
      ({
        left: 180,
        top: 90,
        width: 300,
        height: 40,
        right: 480,
        bottom: 130,
      }) as DOMRect;

    expect(focusNearestEditableScribbleTarget({ x: 33, y: 52 }, document)).toBe(
      false
    );
    expect(document.activeElement).not.toBe(inlineEditor);
  });
});

describe('syncScribbleProxyTextareas', () => {
  function createInlineEditor() {
    const inlineEditor = document.createElement('div');
    inlineEditor.dataset.vRoot = 'true';
    inlineEditor.contentEditable = 'true';
    inlineEditor.tabIndex = -1;
    inlineEditor.getBoundingClientRect = () =>
      ({
        left: 430,
        top: 380,
        width: 120,
        height: 40,
        right: 550,
        bottom: 420,
      }) as DOMRect;
    document.body.append(inlineEditor);
    return inlineEditor;
  }

  test('creates a real textarea over the expanded inline editor Scribble area', () => {
    createInlineEditor();

    expect(syncScribbleProxyTextareas(document)).toBe(2);

    const proxies = document.querySelectorAll<HTMLTextAreaElement>(
      '[data-affine-scribble-proxy="true"]'
    );
    expect(proxies).toHaveLength(2);
    expect(proxies[0]?.style.left).toBe('430px');
    expect(proxies[0]?.style.top).toBe('364px');
    expect(proxies[0]?.style.width).toBe('280px');
    expect(proxies[0]?.style.height).toBe('80px');
    expect(proxies[1]?.style.left).toBe('210px');
    expect(proxies[1]?.style.top).toBe('444px');
    expect(proxies[1]?.style.width).toBe('500px');
    expect(proxies[1]?.style.height).toBe('156px');
    expect(proxies[0]?.style.pointerEvents).toBe('auto');
  });

  test('clips expanded inline editor proxies away from the edgeless toolbar', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    const toolbar = document.createElement('edgeless-toolbar-widget');
    toolbar.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 488,
        width: 800,
        height: 112,
        right: 800,
        bottom: 600,
      }) as DOMRect;
    document.body.append(toolbar);
    createInlineEditor();

    expect(syncScribbleProxyTextareas(document)).toBe(2);

    const proxies = document.querySelectorAll<HTMLTextAreaElement>(
      '[data-affine-scribble-proxy="true"]'
    );
    expect(proxies).toHaveLength(2);
    expect(proxies[1]?.style.left).toBe('210px');
    expect(proxies[1]?.style.top).toBe('444px');
    expect(proxies[1]?.style.width).toBe('500px');
    expect(proxies[1]?.style.height).toBe('44px');
  });

  test('clips expanded inline editor proxies away from mobile detail header chrome', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    });
    const header = document.createElement('div');
    header.dataset.affineEdgelessUiChrome = 'true';
    header.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 1200,
        height: 132,
        right: 1200,
        bottom: 132,
      }) as DOMRect;
    document.body.append(header);

    const inlineEditor = document.createElement('div');
    inlineEditor.dataset.vRoot = 'true';
    inlineEditor.contentEditable = 'true';
    inlineEditor.tabIndex = -1;
    inlineEditor.getBoundingClientRect = () =>
      ({
        left: 600,
        top: 120,
        width: 240,
        height: 36,
        right: 840,
        bottom: 156,
      }) as DOMRect;
    document.body.append(inlineEditor);

    expect(syncScribbleProxyTextareas(document)).toBe(2);

    const proxies = document.querySelectorAll<HTMLTextAreaElement>(
      '[data-affine-scribble-proxy="true"]'
    );
    expect(proxies[0]?.style.top).toBe('132px');
    expect(proxies[0]?.style.height).toBe('48px');
  });

  test('focuses the proxy textarea when available for an inline editor', () => {
    createInlineEditor();

    expect(syncScribbleProxyTextareas(document)).toBe(2);
    const proxy = document.querySelector<HTMLTextAreaElement>(
      '[data-affine-scribble-proxy="true"]'
    );

    expect(
      focusNearestEditableScribbleTarget({ x: 235, y: 523 }, document)
    ).toBe(true);
    expect(document.activeElement).toBe(proxy);
  });

  test('keeps the same proxy textarea across repeated syncs', () => {
    createInlineEditor();

    expect(syncScribbleProxyTextareas(document)).toBe(2);
    const firstProxies = [
      ...document.querySelectorAll<HTMLTextAreaElement>(
        '[data-affine-scribble-proxy="true"]'
      ),
    ];

    expect(syncScribbleProxyTextareas(document)).toBe(2);
    const secondProxies = [
      ...document.querySelectorAll<HTMLTextAreaElement>(
        '[data-affine-scribble-proxy="true"]'
      ),
    ];

    expect(secondProxies[0]).toBe(firstProxies[0]);
    expect(secondProxies[1]).toBe(firstProxies[1]);
    expect(
      document.querySelectorAll('[data-affine-scribble-proxy="true"]')
    ).toHaveLength(2);
  });

  test('forwards proxy input into the inline editor', () => {
    const inlineEditor = createInlineEditor();
    const inserted: string[] = [];
    const inlineRange = { index: 0, length: 0 };
    (inlineEditor as any).inlineEditor = {
      getInlineRange: () => inlineRange,
      insertText: (_range: typeof inlineRange, text: string) => {
        inserted.push(text);
      },
      isComposing: false,
      isReadonly: false,
      isValidInlineRange: () => true,
      setInlineRange: (range: typeof inlineRange) => {
        inlineRange.index = range.index;
        inlineRange.length = range.length;
      },
      yTextLength: 0,
    };
    document.execCommand = vi.fn(() => true);

    expect(syncScribbleProxyTextareas(document)).toBe(2);
    const proxy = document.querySelector<HTMLTextAreaElement>(
      '[data-affine-scribble-proxy="true"]'
    );

    expect(proxy).not.toBeNull();
    proxy!.value = '你';
    proxy!.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(proxy!.value).toBe('');
    expect(inserted).toEqual(['你']);
    expect(inlineRange).toEqual({ index: 1, length: 0 });
    expect(document.execCommand).not.toHaveBeenCalled();
  });
});
