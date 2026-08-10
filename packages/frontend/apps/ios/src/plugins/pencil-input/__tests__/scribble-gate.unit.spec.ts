// eslint-disable-next-line import-x/no-extraneous-dependencies
import { afterEach, describe, expect, test } from 'vitest';

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
      { x: -190, y: 12, width: 640, height: 308 },
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
});

describe('syncScribbleProxyTextareas', () => {
  test('creates a real textarea over the expanded inline editor Scribble area', () => {
    const inlineEditor = document.createElement('div');
    inlineEditor.dataset.vRoot = 'true';
    inlineEditor.contentEditable = 'true';
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

    expect(syncScribbleProxyTextareas(document)).toBe(1);

    const proxy = document.querySelector<HTMLTextAreaElement>(
      '[data-affine-scribble-proxy="true"]'
    );
    expect(proxy).not.toBeNull();
    expect(proxy?.style.left).toBe('210px');
    expect(proxy?.style.top).toBe('332px');
    expect(proxy?.style.width).toBe('560px');
    expect(proxy?.style.height).toBe('308px');
  });
});
