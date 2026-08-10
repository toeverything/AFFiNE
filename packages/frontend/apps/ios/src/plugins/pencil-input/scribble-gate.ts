import type { ScribbleRect } from './definitions';
import { PencilInput } from './index';

const EDITABLE_SCRIBBLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'textarea:not([data-affine-scribble-proxy="true"]):not([disabled]):not([readonly])',
  '[data-v-root="true"][contenteditable="true"]',
].join(',');

const MAX_RECT_COUNT = 80;
const MIN_RECT_SIZE = 1;
const POLL_INTERVAL = 500;
const STICKY_RECT_TTL = 2500;
const INLINE_EDITOR_PADDING_X = 220;
const INLINE_EDITOR_PADDING_TOP = 48;
const INLINE_EDITOR_PADDING_BOTTOM = 220;

interface ScribblePoint {
  x: number;
  y: number;
}

interface ScribbleProxyRecord {
  proxy: HTMLTextAreaElement;
  target: HTMLElement;
}

const scribbleProxyRecords = new WeakMap<Document, ScribbleProxyRecord[]>();

function isHTMLElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement;
}

function isVisibleEditable(element: Element): boolean {
  if (!isHTMLElement(element)) {
    return false;
  }

  if (element.closest('[contenteditable="false"]')) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > MIN_RECT_SIZE && rect.height > MIN_RECT_SIZE;
}

function toScribbleRect(rect: DOMRect): ScribbleRect {
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function isInlineEditor(element: Element): boolean {
  return (
    isHTMLElement(element) &&
    element.dataset.vRoot === 'true' &&
    element.getAttribute('contenteditable') === 'true'
  );
}

function getEditableScribbleElements(root: ParentNode): Element[] {
  return [...root.querySelectorAll(EDITABLE_SCRIBBLE_SELECTOR)]
    .filter(isVisibleEditable)
    .slice(0, MAX_RECT_COUNT);
}

function expandRect(
  rect: DOMRect,
  {
    x,
    top,
    bottom,
  }: {
    x: number;
    top: number;
    bottom: number;
  }
): ScribbleRect {
  return {
    x: Math.round(rect.left - x),
    y: Math.round(rect.top - top),
    width: Math.round(rect.width + x * 2),
    height: Math.round(rect.height + top + bottom),
  };
}

function toElementScribbleRect(element: Element): ScribbleRect {
  const rect = element.getBoundingClientRect();
  if (isInlineEditor(element)) {
    return expandRect(rect, {
      x: INLINE_EDITOR_PADDING_X,
      top: INLINE_EDITOR_PADDING_TOP,
      bottom: INLINE_EDITOR_PADDING_BOTTOM,
    });
  }
  return toScribbleRect(rect);
}

function containsPoint(rect: ScribbleRect, point: ScribblePoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function distanceToRectCenter(
  rect: ScribbleRect,
  point: ScribblePoint
): number {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return Math.hypot(point.x - centerX, point.y - centerY);
}

function selectionIsInside(element: Element): boolean {
  const selection = element.ownerDocument.getSelection();
  if (!selection?.anchorNode) {
    return false;
  }
  return element.contains(selection.anchorNode);
}

function placeSelectionAtEnd(element: Element): void {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selectionIsInside(element)) {
    return;
  }

  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTextIntoTarget(target: HTMLElement, text: string): void {
  if (!text) {
    return;
  }

  target.focus({ preventScroll: true });
  if (isInlineEditor(target)) {
    placeSelectionAtEnd(target);
  }

  const doc = target.ownerDocument;
  if (typeof doc.execCommand === 'function') {
    doc.execCommand('insertText', false, text);
    return;
  }

  target.textContent = `${target.textContent ?? ''}${text}`;
  target.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      data: text,
      inputType: 'insertText',
    })
  );
}

function toPx(value: number): string {
  return `${value}px`;
}

function applyProxyStyle(proxy: HTMLTextAreaElement, rect: ScribbleRect): void {
  Object.assign(proxy.style, {
    position: 'fixed',
    left: toPx(rect.x),
    top: toPx(rect.y),
    width: toPx(rect.width),
    height: toPx(rect.height),
    zIndex: '2147483647',
    opacity: '0.01',
    color: 'transparent',
    caretColor: 'transparent',
    background: 'transparent',
    border: '0',
    outline: '0',
    resize: 'none',
    padding: '0',
    margin: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    WebkitTextFillColor: 'transparent',
  });
}

function createScribbleProxyTextarea(
  target: HTMLElement,
  rect: ScribbleRect
): HTMLTextAreaElement {
  const doc = target.ownerDocument;
  const proxy = doc.createElement('textarea');
  proxy.dataset.affineScribbleProxy = 'true';
  proxy.autocapitalize = 'off';
  proxy.autocomplete = 'off';
  proxy.autocorrect = 'off';
  proxy.spellcheck = false;
  proxy.tabIndex = -1;
  proxy.value = '';
  proxy.setAttribute('aria-label', 'Scribble input proxy');
  applyProxyStyle(proxy, rect);
  proxy.addEventListener('input', () => {
    const text = proxy.value;
    proxy.value = '';
    insertTextIntoTarget(target, text);
    console.warn('[viewport-lifecycle] scribble.proxy.input', {
      length: text.length,
    });
  });
  return proxy;
}

export function disposeScribbleProxyTextareas(
  root: ParentNode = document
): void {
  const doc = root.ownerDocument ?? (root as Document);
  const records = scribbleProxyRecords.get(doc);
  records?.forEach(({ proxy }) => proxy.remove());
  scribbleProxyRecords.delete(doc);
}

export function syncScribbleProxyTextareas(
  root: ParentNode = document
): number {
  const doc = root.ownerDocument ?? (root as Document);
  disposeScribbleProxyTextareas(root);

  const records = getEditableScribbleElements(root)
    .filter(isInlineEditor)
    .filter(isHTMLElement)
    .map(target => {
      const proxy = createScribbleProxyTextarea(
        target,
        toElementScribbleRect(target)
      );
      doc.body.append(proxy);
      return { proxy, target };
    });

  scribbleProxyRecords.set(doc, records);
  return records.length;
}

export function focusNearestEditableScribbleTarget(
  point: ScribblePoint,
  root: ParentNode = document
): boolean {
  const target = getEditableScribbleElements(root)
    .map(element => ({
      element,
      rect: toElementScribbleRect(element),
    }))
    .filter(({ rect }) => containsPoint(rect, point))
    .sort(
      (a, b) =>
        distanceToRectCenter(a.rect, point) -
        distanceToRectCenter(b.rect, point)
    )[0]?.element;

  if (!target || !isHTMLElement(target)) {
    return false;
  }

  target.focus({ preventScroll: true });
  if (isInlineEditor(target)) {
    placeSelectionAtEnd(target);
  }
  return true;
}

export function collectEditableScribbleRects(
  root: ParentNode = document
): ScribbleRect[] {
  return getEditableScribbleElements(root).map(toElementScribbleRect);
}

export function createStickyScribbleRects(
  options: {
    now?: () => number;
    ttl?: number;
  } = {}
): (rects: ScribbleRect[]) => {
  rects: ScribbleRect[];
  sticky: boolean;
} {
  const now = options.now ?? (() => Date.now());
  const ttl = options.ttl ?? STICKY_RECT_TTL;
  let stickyRects: ScribbleRect[] = [];
  let stickyUntil = 0;

  return rects => {
    if (rects.length > 0) {
      stickyRects = rects;
      stickyUntil = now() + ttl;
      return { rects, sticky: false };
    }

    if (stickyRects.length > 0 && now() <= stickyUntil) {
      return { rects: stickyRects, sticky: true };
    }

    stickyRects = [];
    stickyUntil = 0;
    return { rects: [], sticky: false };
  };
}

export function setupNativeScribbleGate(): () => void {
  let disposed = false;
  let lastPayload = '';
  let scheduled = false;
  const getStickyRects = createStickyScribbleRects();
  let scribbleWillBeginHandle: { remove: () => Promise<void> } | null = null;

  PencilInput.addListener('scribbleWillBegin', event => {
    const focused = focusNearestEditableScribbleTarget(event);
    console.warn('[viewport-lifecycle] scribble.gate.focus', {
      focused,
      x: event.x,
      y: event.y,
    });
  })
    .then(handle => {
      if (disposed) {
        handle.remove().catch(() => {});
        return;
      }
      scribbleWillBeginHandle = handle;
    })
    .catch(() => {
      // Older native shells only get the static Scribble gate.
    });

  const sync = () => {
    scheduled = false;
    if (disposed) return;

    const freshRects = collectEditableScribbleRects();
    const proxyCount = syncScribbleProxyTextareas();
    const { rects, sticky } = getStickyRects(freshRects);
    const payload = {
      enabled: true,
      rects,
    };
    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastPayload) {
      return;
    }
    lastPayload = payloadKey;
    console.warn('[viewport-lifecycle] scribble.gate.sync', {
      rects: payload.rects.length,
      freshRects: freshRects.length,
      proxyCount,
      sticky,
    });

    PencilInput.updateScribbleState(payload).catch(() => {
      // Native gate is best-effort; WebKit-only pointer routing remains active.
    });
  };

  const scheduleSync = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    requestAnimationFrame(sync);
  };

  const mutationObserver = new MutationObserver(scheduleSync);
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      'contenteditable',
      'data-v-root',
      'disabled',
      'readonly',
      'style',
      'class',
    ],
    childList: true,
    subtree: true,
  });

  document.addEventListener('focusin', scheduleSync, true);
  document.addEventListener('focusout', scheduleSync, true);
  document.addEventListener('input', scheduleSync, true);
  document.addEventListener('beforeinput', scheduleSync, true);
  document.addEventListener('selectionchange', scheduleSync, true);
  document.addEventListener('pointerdown', scheduleSync, true);
  document.addEventListener('touchstart', scheduleSync, true);
  window.addEventListener('resize', scheduleSync, true);
  window.addEventListener('scroll', scheduleSync, true);

  const interval = window.setInterval(scheduleSync, POLL_INTERVAL);
  scheduleSync();

  return () => {
    disposed = true;
    mutationObserver.disconnect();
    document.removeEventListener('focusin', scheduleSync, true);
    document.removeEventListener('focusout', scheduleSync, true);
    document.removeEventListener('input', scheduleSync, true);
    document.removeEventListener('beforeinput', scheduleSync, true);
    document.removeEventListener('selectionchange', scheduleSync, true);
    document.removeEventListener('pointerdown', scheduleSync, true);
    document.removeEventListener('touchstart', scheduleSync, true);
    window.removeEventListener('resize', scheduleSync, true);
    window.removeEventListener('scroll', scheduleSync, true);
    window.clearInterval(interval);
    scribbleWillBeginHandle?.remove().catch(() => {});
    disposeScribbleProxyTextareas();
    PencilInput.updateScribbleState({ enabled: false, rects: [] }).catch(
      () => {}
    );
  };
}
