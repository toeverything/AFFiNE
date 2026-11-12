import { insertTextFromPencilScribble } from '@blocksuite/affine/rich-text';

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
const PROXY_INTERACTIVE_TTL = 1200;
const STICKY_RECT_TTL = 2500;
const INLINE_EDITOR_PADDING_LEFT = 220;
const INLINE_EDITOR_PADDING_RIGHT = 160;
const INLINE_EDITOR_PADDING_TOP = 16;
const INLINE_EDITOR_PADDING_BOTTOM = 180;
const INLINE_EDITOR_INLINE_PADDING_BOTTOM = 24;
const SCRIBBLE_CHROME_EXCLUSION_TOP = 96;
const SCRIBBLE_EDGELESS_TOOLBAR_EXCLUSION_BOTTOM = 112;
const SCRIBBLE_PROXY_EXCLUSION_SELECTOR = [
  'edgeless-toolbar-widget',
  'affine-edgeless-toolbar-widget',
  'edgeless-zoom-toolbar',
  'affine-edgeless-zoom-toolbar-widget',
  '[data-affine-edgeless-ui-chrome="true"]',
  '[data-affine-scribble-exclusion="true"]',
].join(',');

interface ScribblePoint {
  x: number;
  y: number;
}

interface ScribbleProxyRecord {
  index: number;
  proxy: HTMLTextAreaElement;
  rect: ScribbleRect;
  target: HTMLElement;
}

const scribbleProxyRecords = new WeakMap<Document, ScribbleProxyRecord[]>();
const scribbleProxyTimers = new WeakMap<HTMLTextAreaElement, number>();

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

  if (element.closest('[inert], [aria-hidden="true"]')) {
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

function getViewportSize(doc: Document): { width: number; height: number } {
  const win = doc.defaultView;
  return {
    width: Math.round(win?.innerWidth || doc.documentElement.clientWidth || 0),
    height: Math.round(
      win?.innerHeight || doc.documentElement.clientHeight || 0
    ),
  };
}

function hasPositiveArea(rect: ScribbleRect): boolean {
  return rect.width > MIN_RECT_SIZE && rect.height > MIN_RECT_SIZE;
}

function intersects(a: ScribbleRect, b: ScribbleRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function subtractRect(
  source: ScribbleRect,
  exclusion: ScribbleRect
): ScribbleRect[] {
  if (!intersects(source, exclusion)) {
    return [source];
  }

  const sourceRight = source.x + source.width;
  const sourceBottom = source.y + source.height;
  const exclusionRight = exclusion.x + exclusion.width;
  const exclusionBottom = exclusion.y + exclusion.height;
  const overlapLeft = Math.max(source.x, exclusion.x);
  const overlapRight = Math.min(sourceRight, exclusionRight);
  const overlapTop = Math.max(source.y, exclusion.y);
  const overlapBottom = Math.min(sourceBottom, exclusionBottom);

  return [
    {
      x: source.x,
      y: source.y,
      width: source.width,
      height: overlapTop - source.y,
    },
    {
      x: source.x,
      y: overlapBottom,
      width: source.width,
      height: sourceBottom - overlapBottom,
    },
    {
      x: source.x,
      y: overlapTop,
      width: overlapLeft - source.x,
      height: overlapBottom - overlapTop,
    },
    {
      x: overlapRight,
      y: overlapTop,
      width: sourceRight - overlapRight,
      height: overlapBottom - overlapTop,
    },
  ].filter(hasPositiveArea);
}

function subtractRects(
  rects: ScribbleRect[],
  exclusions: ScribbleRect[]
): ScribbleRect[] {
  return exclusions.reduce(
    (currentRects, exclusion) =>
      currentRects.flatMap(rect => subtractRect(rect, exclusion)),
    rects
  );
}

function getScribbleProxyExclusionRects(root: ParentNode): ScribbleRect[] {
  const doc = root.ownerDocument ?? (root as Document);
  const viewport = getViewportSize(doc);
  const exclusions = [
    ...doc.querySelectorAll(SCRIBBLE_PROXY_EXCLUSION_SELECTOR),
  ]
    .filter(isVisibleEditable)
    .map(element => toScribbleRect(element.getBoundingClientRect()))
    .filter(hasPositiveArea);

  if (doc.querySelector('edgeless-toolbar-widget')) {
    exclusions.push({
      x: 0,
      y: Math.max(
        0,
        viewport.height - SCRIBBLE_EDGELESS_TOOLBAR_EXCLUSION_BOTTOM
      ),
      width: viewport.width,
      height: SCRIBBLE_EDGELESS_TOOLBAR_EXCLUSION_BOTTOM,
    });
  }

  return exclusions.filter(hasPositiveArea);
}

function getProxyRect(proxy: HTMLTextAreaElement): ScribbleRect {
  return toScribbleRect(proxy.getBoundingClientRect());
}

function isInlineEditor(element: Element): boolean {
  return (
    isHTMLElement(element) &&
    element.dataset.vRoot === 'true' &&
    element.getAttribute('contenteditable') === 'true'
  );
}

function getProxyTarget(doc: Document, element: Element): HTMLElement | null {
  const proxy = element.closest('[data-affine-scribble-proxy="true"]');
  if (!(proxy instanceof HTMLTextAreaElement)) {
    return null;
  }

  return (
    scribbleProxyRecords.get(doc)?.find(record => record.proxy === proxy)
      ?.target ?? null
  );
}

function isActiveEditable(element: Element, doc: Document): boolean {
  const active = doc.activeElement;
  return (
    element === active ||
    (active instanceof Element && element.contains(active)) ||
    selectionIsInside(element)
  );
}

function isForegroundScribbleTarget(
  element: Element,
  point: ScribblePoint,
  root: ParentNode
): boolean {
  if (element.closest('[inert], [aria-hidden="true"]')) {
    return false;
  }

  const doc = root.ownerDocument ?? (root as Document);
  const hit = doc.elementFromPoint(point.x, point.y);
  if (!hit) {
    return isActiveEditable(element, doc);
  }

  const proxyTarget = getProxyTarget(doc, hit);
  if (proxyTarget === element) {
    return true;
  }

  const hitEditable = hit.closest(EDITABLE_SCRIBBLE_SELECTOR);
  if (hitEditable) {
    return hitEditable === element;
  }

  return element.contains(hit) || isActiveEditable(element, doc);
}

function getEditableScribbleElements(root: ParentNode): Element[] {
  const doc = root.ownerDocument ?? (root as Document);
  const viewport = {
    x: 0,
    y: 0,
    ...getViewportSize(doc),
  };

  return [...root.querySelectorAll(EDITABLE_SCRIBBLE_SELECTOR)]
    .filter(isVisibleEditable)
    .map(element => ({
      element,
      rects: toClippedElementScribbleRects(element, root),
    }))
    .filter(({ rects }) => rects.some(rect => intersects(rect, viewport)))
    .slice(0, MAX_RECT_COUNT)
    .map(({ element }) => element);
}

function toInlineEditorScribbleRects(rect: DOMRect): ScribbleRect[] {
  const top = Math.max(
    SCRIBBLE_CHROME_EXCLUSION_TOP,
    rect.top - INLINE_EDITOR_PADDING_TOP
  );
  const inlineBottom = rect.bottom + INLINE_EDITOR_INLINE_PADDING_BOTTOM;
  return [
    {
      x: Math.round(rect.left),
      y: Math.round(top),
      width: Math.round(rect.width + INLINE_EDITOR_PADDING_RIGHT),
      height: Math.round(inlineBottom - top),
    },
    {
      x: Math.round(rect.left - INLINE_EDITOR_PADDING_LEFT),
      y: Math.round(inlineBottom),
      width: Math.round(
        rect.width + INLINE_EDITOR_PADDING_LEFT + INLINE_EDITOR_PADDING_RIGHT
      ),
      height: Math.round(
        rect.bottom + INLINE_EDITOR_PADDING_BOTTOM - inlineBottom
      ),
    },
  ].filter(
    ({ width, height }) => width > MIN_RECT_SIZE && height > MIN_RECT_SIZE
  );
}

function toElementScribbleRects(element: Element): ScribbleRect[] {
  const rect = element.getBoundingClientRect();
  if (isInlineEditor(element)) {
    return toInlineEditorScribbleRects(rect);
  }
  return [toScribbleRect(rect)];
}

function toClippedElementScribbleRects(
  element: Element,
  root: ParentNode
): ScribbleRect[] {
  return subtractRects(
    toElementScribbleRects(element),
    getScribbleProxyExclusionRects(root)
  );
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
    if (insertTextFromPencilScribble(target, text)) {
      return;
    }
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

function applyProxyStyle(
  proxy: HTMLTextAreaElement,
  rect: ScribbleRect,
  interactive = false
): void {
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
    pointerEvents: interactive ? 'auto' : 'none',
    touchAction: 'auto',
    WebkitTextFillColor: 'transparent',
  });
}

function clearProxyInteractiveTimer(proxy: HTMLTextAreaElement): void {
  const timer = scribbleProxyTimers.get(proxy);
  if (timer === undefined) return;
  proxy.ownerDocument.defaultView?.clearTimeout(timer);
  scribbleProxyTimers.delete(proxy);
}

function setProxyInteractive(
  proxy: HTMLTextAreaElement,
  rect: ScribbleRect,
  interactive: boolean
): void {
  clearProxyInteractiveTimer(proxy);
  if (interactive) {
    proxy.dataset.affineScribbleProxyActive = 'true';
  } else {
    delete proxy.dataset.affineScribbleProxyActive;
  }
  applyProxyStyle(proxy, rect, interactive);
}

function enableProxyForScribble(proxy: HTMLTextAreaElement): void {
  setProxyInteractive(proxy, getProxyRect(proxy), true);
  const win = proxy.ownerDocument.defaultView;
  if (!win) return;
  const timer = win.setTimeout(() => {
    setProxyInteractive(proxy, getProxyRect(proxy), false);
  }, PROXY_INTERACTIVE_TTL);
  scribbleProxyTimers.set(proxy, timer);
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
  proxy.inputMode = 'text';
  proxy.spellcheck = false;
  proxy.tabIndex = -1;
  proxy.value = '';
  proxy.setAttribute('autocorrect', 'off');
  proxy.setAttribute('aria-label', 'Scribble input proxy');
  applyProxyStyle(proxy, rect);
  proxy.addEventListener('input', () => {
    const text = proxy.value;
    proxy.value = '';
    insertTextIntoTarget(target, text);
    setProxyInteractive(proxy, getProxyRect(proxy), false);
  });
  return proxy;
}

export function disposeScribbleProxyTextareas(
  root: ParentNode = document
): void {
  const doc = root.ownerDocument ?? (root as Document);
  const records = scribbleProxyRecords.get(doc);
  records?.forEach(({ proxy }) => {
    clearProxyInteractiveTimer(proxy);
    proxy.remove();
  });
  scribbleProxyRecords.delete(doc);
}

export function syncScribbleProxyTextareas(
  root: ParentNode = document
): number {
  const doc = root.ownerDocument ?? (root as Document);
  const previousRecords = scribbleProxyRecords.get(doc) ?? [];
  const previousByTarget = new WeakMap<HTMLElement, HTMLTextAreaElement[]>();
  previousRecords.forEach(({ index, proxy, target }) => {
    const proxies = previousByTarget.get(target) ?? [];
    proxies[index] = proxy;
    previousByTarget.set(target, proxies);
  });

  const inlineTargets = getEditableScribbleElements(root)
    .filter(isInlineEditor)
    .filter(isHTMLElement);

  const records = inlineTargets.flatMap(target =>
    toClippedElementScribbleRects(target, root).map((rect, index) => {
      const existingProxy = previousByTarget.get(target)?.[index];
      const proxy =
        existingProxy && existingProxy.isConnected
          ? existingProxy
          : createScribbleProxyTextarea(target, rect);
      applyProxyStyle(
        proxy,
        rect,
        proxy.dataset.affineScribbleProxyActive === 'true'
      );
      if (!proxy.isConnected) {
        doc.body.append(proxy);
      }
      return { index, proxy, rect, target };
    })
  );

  const activeProxies = new Set(records.map(({ proxy }) => proxy));
  previousRecords.forEach(({ proxy }) => {
    if (!activeProxies.has(proxy)) {
      clearProxyInteractiveTimer(proxy);
      proxy.remove();
    }
  });

  scribbleProxyRecords.set(doc, records);
  return records.length;
}

export function focusNearestEditableScribbleTarget(
  point: ScribblePoint,
  root: ParentNode = document
): boolean {
  const doc = root.ownerDocument ?? (root as Document);
  const target = getEditableScribbleElements(root)
    .map(element => ({
      element,
      rects: toClippedElementScribbleRects(element, root),
    }))
    .filter(({ rects }) => rects.some(rect => containsPoint(rect, point)))
    .filter(({ element }) => isForegroundScribbleTarget(element, point, root))
    .sort((a, b) => {
      const activeDelta =
        Number(isActiveEditable(b.element, doc)) -
        Number(isActiveEditable(a.element, doc));
      if (activeDelta !== 0) {
        return activeDelta;
      }
      return (
        Math.min(...a.rects.map(rect => distanceToRectCenter(rect, point))) -
        Math.min(...b.rects.map(rect => distanceToRectCenter(rect, point)))
      );
    })[0]?.element;

  if (!target || !isHTMLElement(target)) {
    return false;
  }

  target.focus({ preventScroll: true });
  if (isInlineEditor(target)) {
    placeSelectionAtEnd(target);
    const proxy = scribbleProxyRecords
      .get(doc)
      ?.find(record => record.target === target)?.proxy;
    if (proxy?.isConnected) {
      enableProxyForScribble(proxy);
      proxy.focus({ preventScroll: true });
    }
  }
  return true;
}

export function collectEditableScribbleRects(
  root: ParentNode = document
): ScribbleRect[] {
  return getEditableScribbleElements(root).flatMap(element =>
    toClippedElementScribbleRects(element, root)
  );
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
  let scheduleSync = () => {};

  PencilInput.addListener('scribbleWillBegin', event => {
    const focused = focusNearestEditableScribbleTarget(event);
    if (!focused) {
      scheduleSync();
    }
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
    syncScribbleProxyTextareas();
    const { rects } = getStickyRects(freshRects);
    const payload = {
      enabled: true,
      nativeInteractionEnabled: true,
      rects,
    };
    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastPayload) {
      return;
    }
    lastPayload = payloadKey;

    PencilInput.updateScribbleState(payload).catch(() => {
      // Native gate is best-effort; WebKit-only pointer routing remains active.
    });
  };

  scheduleSync = () => {
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
