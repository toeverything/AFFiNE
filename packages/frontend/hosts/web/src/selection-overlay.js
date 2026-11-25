// @ts-check

/**
 * Canvas-drawn text selection overlay, teardrop handles, and mobile clipboard
 * gesture bridge. Draws all selection visuals on `#app-canvas` with zero
 * floating DOM nodes.
 */

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} CaretAnchor
 * @property {number} x
 * @property {number} y
 * @property {number} height
 * @property {'ltr' | 'rtl'} [dir]
 */

/**
 * @typedef {Object} SafeAreaInsets
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 * @property {number} left
 */

/**
 * @typedef {'copy' | 'cut' | 'paste' | 'select-all'} SelectionActionId
 */

/**
 * @typedef {Object} SelectionHandleLayout
 * @property {'start' | 'end'} kind
 * @property {'left' | 'right'} flare
 * @property {number} stemX
 * @property {number} stemTop
 * @property {number} stemBottom
 * @property {number} headCx
 * @property {number} headCy
 * @property {number} radius
 * @property {Rect} hitRect
 */

/**
 * @typedef {Object} SelectionMenuItemLayout
 * @property {SelectionActionId} id
 * @property {string} label
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} SelectionMenuLayout
 * @property {boolean} visible
 * @property {'above' | 'below'} placement
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} arrowX
 * @property {SelectionMenuItemLayout[]} items
 */

/**
 * @typedef {Object} SelectionLoupeLayout
 * @property {boolean} visible
 * @property {'start' | 'end' | null} handle
 * @property {number} cx
 * @property {number} cy
 * @property {number} radius
 */

/**
 * @typedef {Object} SelectionOverlayLayout
 * @property {Rect[]} rects
 * @property {SelectionHandleLayout} startHandle
 * @property {SelectionHandleLayout} endHandle
 * @property {SelectionMenuLayout} menu
 * @property {SelectionLoupeLayout} loupe
 * @property {boolean} dragging
 */

/**
 * @typedef {Object} SelectionOverlayInput
 * @property {{ width: number, height: number, safeArea?: Partial<SafeAreaInsets> }} viewport
 * @property {Rect[]} rects
 * @property {CaretAnchor} caretStart
 * @property {CaretAnchor} caretEnd
 * @property {boolean} [dragging]
 * @property {'start' | 'end' | null} [activeHandle]
 * @property {SelectionActionId[]} [actions]
 * @property {boolean} [readOnly]
 * @property {boolean} [canPaste]
 * @property {number} [edgeMargin]
 */

const ACTION_LABELS = Object.freeze({
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  'select-all': 'Select All',
});

const ACTION_MIN_WIDTHS = Object.freeze({
  copy: 64,
  cut: 56,
  paste: 68,
  'select-all': 92,
});

const DEFAULT_ACTIONS = /** @type {const} */ ([
  'copy',
  'cut',
  'paste',
  'select-all',
]);

const MIN_EDGE_MARGIN_PX = 12;
const HANDLE_RADIUS_PX = 7.5;
const HANDLE_HIT_HALF_SIZE_PX = 22;
const MENU_HEIGHT_PX = 40;
const MENU_GAP_PX = 12;
const LOUPE_RADIUS_PX = 28;

/**
 * Clamps a numeric value to `[min, max]`.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Returns true when `(x, y)` lies inside `rect`.
 *
 * @param {Rect} rect
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function pointInRect(rect, x, y) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

/**
 * Builds one teardrop handle layout with an outward circular head.
 *
 * @param {'start' | 'end'} kind
 * @param {CaretAnchor} caret
 * @param {'left' | 'right'} flare
 * @param {number} headCx
 * @returns {SelectionHandleLayout}
 */
function buildHandleLayout(kind, caret, flare, headCx) {
  const stemTop = caret.y;
  const stemBottom = caret.y + Math.max(12, caret.height);
  const headCy = stemBottom + HANDLE_RADIUS_PX + 2;
  const hitLeft = Math.min(caret.x, headCx) - HANDLE_HIT_HALF_SIZE_PX;
  const hitRight = Math.max(caret.x, headCx) + HANDLE_HIT_HALF_SIZE_PX;
  const hitTop = stemTop - 8;
  const hitBottom = headCy + HANDLE_HIT_HALF_SIZE_PX;
  return {
    kind,
    flare,
    stemX: caret.x,
    stemTop,
    stemBottom,
    headCx,
    headCy,
    radius: HANDLE_RADIUS_PX,
    hitRect: {
      x: hitLeft,
      y: hitTop,
      width: hitRight - hitLeft,
      height: hitBottom - hitTop,
    },
  };
}

/**
 * Computes pure layout geometry for selection highlights, outward-flared
 * teardrop handles, and the floating action menu.
 *
 * @param {SelectionOverlayInput} input
 * @returns {SelectionOverlayLayout}
 */
export function computeSelectionOverlayLayout(input) {
  const safeTop = Math.max(0, input.viewport.safeArea?.top ?? 0);
  const safeRight = Math.max(0, input.viewport.safeArea?.right ?? 0);
  const safeBottom = Math.max(0, input.viewport.safeArea?.bottom ?? 0);
  const safeLeft = Math.max(0, input.viewport.safeArea?.left ?? 0);
  const edgeMargin = Math.max(
    MIN_EDGE_MARGIN_PX,
    input.edgeMargin ?? MIN_EDGE_MARGIN_PX
  );

  const rects = (input.rects || []).map(r => ({
    x: r.x,
    y: r.y,
    width: Math.max(0, r.width),
    height: Math.max(0, r.height),
  }));

  const start = input.caretStart;
  const end = input.caretEnd;
  const startIsVisualLeft =
    start.x < end.x || (start.x === end.x && start.dir !== 'rtl');
  /** @type {'left' | 'right'} */
  const startFlare = startIsVisualLeft ? 'left' : 'right';
  /** @type {'left' | 'right'} */
  const endFlare = startIsVisualLeft ? 'right' : 'left';

  const flareOffset = HANDLE_RADIUS_PX * 0.9;
  let startHeadCx =
    start.x + (startFlare === 'left' ? -flareOffset : flareOffset);
  let endHeadCx = end.x + (endFlare === 'left' ? -flareOffset : flareOffset);

  const startHeadCy =
    start.y + Math.max(12, start.height) + HANDLE_RADIUS_PX + 2;
  const endHeadCy = end.y + Math.max(12, end.height) + HANDLE_RADIUS_PX + 2;
  const minCenterGap = HANDLE_RADIUS_PX * 2 + 4;
  if (Math.abs(startHeadCy - endHeadCy) < HANDLE_RADIUS_PX * 2 + 2) {
    const gap = Math.abs(endHeadCx - startHeadCx);
    if (gap < minCenterGap) {
      const push = (minCenterGap - gap) / 2;
      startHeadCx += startFlare === 'left' ? -push : push;
      endHeadCx += endFlare === 'left' ? -push : push;
    }
  }

  const startHandle = buildHandleLayout(
    'start',
    start,
    startFlare,
    startHeadCx
  );
  const endHandle = buildHandleLayout('end', end, endFlare, endHeadCx);

  const requestedActions = input.actions
    ? [...input.actions]
    : [...DEFAULT_ACTIONS];
  const filteredActions = requestedActions.filter(id => {
    if (input.readOnly && (id === 'cut' || id === 'paste')) {
      return false;
    }
    if (input.canPaste === false && id === 'paste') {
      return false;
    }
    return Boolean(ACTION_LABELS[id]);
  });

  const maxBarWidth = Math.max(
    120,
    input.viewport.width - safeLeft - safeRight - edgeMargin * 2
  );
  const rawWidth = filteredActions.reduce(
    (sum, id) => sum + ACTION_MIN_WIDTHS[id],
    0
  );
  const scale = rawWidth > maxBarWidth ? maxBarWidth / rawWidth : 1;
  const barWidth = Math.min(rawWidth, maxBarWidth);

  const bounds = rects.reduce(
    (acc, r) => ({
      minX: Math.min(acc.minX, r.x),
      minY: Math.min(acc.minY, r.y),
      maxX: Math.max(acc.maxX, r.x + r.width),
      maxY: Math.max(acc.maxY, r.y + r.height),
    }),
    {
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y + start.height, end.y + end.height),
    }
  );

  const anchorMidX = (bounds.minX + bounds.maxX) / 2;
  const minX = safeLeft + edgeMargin;
  const maxX = Math.max(
    minX,
    input.viewport.width - safeRight - edgeMargin - barWidth
  );
  const menuX = clamp(anchorMidX - barWidth / 2, minX, maxX);

  const aboveY = bounds.minY - MENU_GAP_PX - MENU_HEIGHT_PX;
  const belowY =
    Math.max(bounds.maxY, startHandle.headCy, endHandle.headCy) +
    HANDLE_RADIUS_PX +
    MENU_GAP_PX;
  const fitsAbove = aboveY >= safeTop + 8;
  /** @type {'above' | 'below'} */
  const placement = fitsAbove ? 'above' : 'below';
  const menuY = fitsAbove
    ? aboveY
    : clamp(
        belowY,
        safeTop + 8,
        Math.max(
          safeTop + 8,
          input.viewport.height - safeBottom - MENU_HEIGHT_PX - 8
        )
      );

  let cursorX = menuX;
  const items = filteredActions.map(id => {
    const itemWidth = ACTION_MIN_WIDTHS[id] * scale;
    const item = {
      id,
      label: ACTION_LABELS[id],
      x: cursorX,
      y: menuY,
      width: itemWidth,
      height: MENU_HEIGHT_PX,
    };
    cursorX += itemWidth;
    return item;
  });

  const dragging = Boolean(input.dragging);
  const activeHandle = dragging ? input.activeHandle || 'end' : null;
  const loupeAnchor = activeHandle === 'start' ? start : end;
  const loupeCx = clamp(
    loupeAnchor.x,
    safeLeft + LOUPE_RADIUS_PX + 8,
    input.viewport.width - safeRight - LOUPE_RADIUS_PX - 8
  );
  const loupeCy = Math.max(
    safeTop + LOUPE_RADIUS_PX + 8,
    loupeAnchor.y - LOUPE_RADIUS_PX - 14
  );

  return {
    rects,
    startHandle,
    endHandle,
    menu: {
      visible: !dragging && items.length > 0 && rects.length > 0,
      placement,
      x: menuX,
      y: menuY,
      width: barWidth,
      height: MENU_HEIGHT_PX,
      arrowX: clamp(anchorMidX, menuX + 16, menuX + barWidth - 16),
      items,
    },
    loupe: {
      visible: dragging,
      handle: activeHandle,
      cx: loupeCx,
      cy: loupeCy,
      radius: LOUPE_RADIUS_PX,
    },
    dragging,
  };
}

/**
 * Traces a rounded rectangle path on a Canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 */
function traceRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draws a single teardrop handle on a Canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {SelectionHandleLayout} handle
 * @param {string} accentColor
 * @param {string} ringColor
 */
function drawTeardropHandle(ctx, handle, accentColor, ringColor) {
  ctx.save();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(handle.stemX, handle.stemTop);
  ctx.lineTo(handle.stemX, handle.stemBottom);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(handle.stemX, handle.stemBottom - 1);
  ctx.lineTo(handle.headCx, handle.headCy);
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(handle.headCx, handle.headCy, handle.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the selection highlight, dual teardrop handles, optional magnifier
 * loupe, and floating action bar directly on a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {SelectionOverlayLayout} layout
 * @param {{ theme?: 'light' | 'dark', activeActionId?: SelectionActionId | null }} [options]
 */
export function drawSelectionOverlay(ctx, layout, options = {}) {
  const dark = options.theme === 'dark';
  const accent = dark ? '#4c9aff' : '#1e6efb';
  const selectionFill = dark
    ? 'rgba(76, 154, 255, 0.28)'
    : 'rgba(30, 110, 251, 0.2)';
  const menuBg = dark ? '#242731' : '#181a20';
  const menuBorder = dark
    ? 'rgba(255, 255, 255, 0.14)'
    : 'rgba(255, 255, 255, 0.1)';
  const menuDivider = 'rgba(255, 255, 255, 0.16)';
  const menuText = '#ffffff';
  const activeBg = 'rgba(255, 255, 255, 0.14)';
  const ringColor = dark ? '#141414' : '#ffffff';

  ctx.save();
  ctx.fillStyle = selectionFill;
  for (const r of layout.rects) {
    traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 4);
    ctx.fill();
  }

  drawTeardropHandle(ctx, layout.startHandle, accent, ringColor);
  drawTeardropHandle(ctx, layout.endHandle, accent, ringColor);

  if (layout.loupe.visible) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.26)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = dark ? '#22252e' : '#ffffff';
    ctx.beginPath();
    ctx.arc(
      layout.loupe.cx,
      layout.loupe.cy,
      layout.loupe.radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      layout.loupe.cx,
      layout.loupe.cy,
      layout.loupe.radius,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(layout.loupe.cx, layout.loupe.cy - 10);
    ctx.lineTo(layout.loupe.cx, layout.loupe.cy + 10);
    ctx.stroke();
    ctx.restore();
  }

  if (layout.menu.visible) {
    const { x, y, width, height, arrowX, placement, items } = layout.menu;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = menuBg;
    traceRoundedRect(ctx, x, y, width, height, 10);
    ctx.fill();

    // Pointer beak
    ctx.beginPath();
    if (placement === 'above') {
      ctx.moveTo(arrowX - 6, y + height);
      ctx.lineTo(arrowX + 6, y + height);
      ctx.lineTo(arrowX, y + height + 6);
    } else {
      ctx.moveTo(arrowX - 6, y);
      ctx.lineTo(arrowX + 6, y);
      ctx.lineTo(arrowX, y - 6);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = menuBorder;
    ctx.lineWidth = 1;
    traceRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, 10);
    ctx.stroke();

    ctx.font =
      '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (options.activeActionId === item.id) {
        ctx.fillStyle = activeBg;
        traceRoundedRect(
          ctx,
          item.x + 2,
          item.y + 2,
          item.width - 4,
          item.height - 4,
          8
        );
        ctx.fill();
      }
      ctx.fillStyle = menuText;
      ctx.fillText(
        item.label,
        item.x + item.width / 2,
        item.y + item.height / 2
      );

      if (i < items.length - 1) {
        ctx.strokeStyle = menuDivider;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(item.x + item.width, item.y + 9);
        ctx.lineTo(item.x + item.width, item.y + item.height - 9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Executes a clipboard action synchronously inside the user gesture stack.
 * Uses `navigator.clipboard` in secure contexts and falls back to `#ime`
 * transient copy on non-HTTPS origins. Never deletes text on Cut if the
 * clipboard write fails.
 *
 * @param {Object} params
 * @param {SelectionActionId} params.action
 * @param {() => string} params.getSelectedText
 * @param {() => unknown} [params.getSelectionToken]
 * @param {(captured?: { token: unknown, text: string }) => void} [params.deleteSelection]
 * @param {(text: string) => void} [params.insertText]
 * @param {() => void} [params.selectAll]
 * @param {{ writeText?: (text: string) => Promise<void>, readText?: () => Promise<string> } | null} [params.clipboard]
 * @param {boolean} [params.isSecureContext]
 * @param {HTMLTextAreaElement | null} [params.imeEl]
 * @param {Document | null} [params.doc]
 * @returns {Promise<{ ok: boolean, action: SelectionActionId, method?: string, text?: string, reason?: string }>}
 */
export async function executeClipboardAction(params) {
  const {
    action,
    getSelectedText,
    getSelectionToken,
    deleteSelection,
    insertText,
    selectAll,
    clipboard = globalThis.navigator?.clipboard ?? null,
    isSecureContext = globalThis.isSecureContext ?? true,
    imeEl = null,
    doc = globalThis.document ?? null,
  } = params;

  if (action === 'select-all') {
    selectAll?.();
    return { ok: true, action, method: 'editor' };
  }

  /** @param {string} text */
  async function writeTextInGesture(text) {
    let asyncErrorReason = null;
    if (
      isSecureContext &&
      clipboard &&
      typeof clipboard.writeText === 'function'
    ) {
      try {
        await clipboard.writeText(text);
        return { ok: true, method: 'async-clipboard' };
      } catch (error) {
        asyncErrorReason =
          error instanceof Error ? error.message : String(error);
      }
    }
    if (imeEl && doc && typeof doc.execCommand === 'function') {
      const prevReadOnly = imeEl.readOnly;
      try {
        imeEl.readOnly = false;
        imeEl.value = text;
        imeEl.focus?.({ preventScroll: true });
        imeEl.setSelectionRange?.(0, text.length);
        const copied = Boolean(doc.execCommand('copy'));
        imeEl.value = '';
        imeEl.setSelectionRange?.(0, 0);
        imeEl.readOnly = prevReadOnly;
        return copied
          ? { ok: true, method: 'exec-command-fallback' }
          : {
              ok: false,
              reason: asyncErrorReason || 'exec-command-copy-rejected',
            };
      } catch (error) {
        imeEl.value = '';
        imeEl.readOnly = prevReadOnly;
        return {
          ok: false,
          reason:
            asyncErrorReason ||
            (error instanceof Error ? error.message : String(error)),
        };
      }
    }
    return { ok: false, reason: asyncErrorReason || 'clipboard-unavailable' };
  }

  if (action === 'copy' || action === 'cut') {
    const selectedText = getSelectedText();
    const hasTokenFn = typeof getSelectionToken === 'function';
    const initialToken = hasTokenFn ? getSelectionToken() : undefined;
    if (
      action === 'cut' &&
      typeof deleteSelection === 'function' &&
      (!hasTokenFn || initialToken === null || initialToken === undefined)
    ) {
      return { ok: false, action, reason: 'missing-selection-token' };
    }
    const writeRes = await writeTextInGesture(selectedText);
    if (!writeRes.ok) {
      return { ok: false, action, reason: writeRes.reason };
    }
    if (action === 'cut') {
      const currentText = getSelectedText();
      const tokenChanged =
        hasTokenFn && !Object.is(getSelectionToken(), initialToken);
      if (tokenChanged || currentText !== selectedText) {
        return {
          ok: false,
          action,
          reason: 'selection-changed-during-cut',
        };
      }
      deleteSelection?.({ token: initialToken, text: selectedText });
    }
    return {
      ok: true,
      action,
      method: writeRes.method,
      text: selectedText,
    };
  }

  if (action === 'paste') {
    if (
      isSecureContext &&
      clipboard &&
      typeof clipboard.readText === 'function'
    ) {
      try {
        const text = await clipboard.readText();
        insertText?.(text);
        return { ok: true, action, method: 'async-clipboard', text };
      } catch (error) {
        return {
          ok: false,
          action,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { ok: false, action, reason: 'clipboard-read-unavailable' };
  }

  return { ok: false, action, reason: 'unknown-action' };
}

/**
 * Suppresses native `#ime` context menus and residual text selection while
 * the canvas selection overlay owns the active selection.
 *
 * @param {HTMLTextAreaElement} imeEl
 * @param {() => boolean} isOverlayActive
 */
export function attachImeSelectionGuard(imeEl, isOverlayActive) {
  /** @param {Event} event */
  function preventNativeMenu(event) {
    if (isOverlayActive()) {
      event.preventDefault?.();
    }
  }

  imeEl.addEventListener?.('contextmenu', preventNativeMenu);
  imeEl.addEventListener?.('selectstart', preventNativeMenu);

  return {
    dispose() {
      imeEl.removeEventListener?.('contextmenu', preventNativeMenu);
      imeEl.removeEventListener?.('selectstart', preventNativeMenu);
    },
  };
}

/**
 * Creates a pointer hit-testing and drag state machine for the canvas
 * selection overlay.
 *
 * @param {Object} options
 * @param {() => SelectionOverlayInput | null} options.getInput
 * @param {(handle: 'start' | 'end', x: number, y: number) => void} [options.onDragHandle]
 * @param {(action: SelectionActionId) => Promise<unknown> | unknown} [options.onAction]
 * @param {(layout: SelectionOverlayLayout | null) => void} [options.onLayoutChange]
 */
export function createSelectionOverlayController(options) {
  /** @type {'start' | 'end' | null} */
  let draggingHandle = null;
  /** @type {SelectionActionId | null} */
  let pressedMenuAction = null;
  /** @type {SelectionActionId | null} */
  let activeActionId = null;

  /** @returns {SelectionOverlayLayout | null} */
  function getLayout() {
    const raw = options.getInput();
    if (!raw) {
      return null;
    }
    return computeSelectionOverlayLayout({
      ...raw,
      dragging: draggingHandle !== null,
      activeHandle: draggingHandle,
    });
  }

  function notify() {
    options.onLayoutChange?.(getLayout());
  }

  /**
   * Hit-tests the floating menu items first, then the two teardrop handles.
   *
   * @param {number} x
   * @param {number} y
   * @returns {{ kind: 'menu', action: SelectionActionId } | { kind: 'handle', handle: 'start' | 'end' } | null}
   */
  function hitTest(x, y) {
    const layout = getLayout();
    if (!layout) {
      return null;
    }
    if (layout.menu.visible) {
      for (const item of layout.menu.items) {
        if (pointInRect(item, x, y)) {
          return { kind: 'menu', action: item.id };
        }
      }
    }
    if (pointInRect(layout.endHandle.hitRect, x, y)) {
      return { kind: 'handle', handle: 'end' };
    }
    if (pointInRect(layout.startHandle.hitRect, x, y)) {
      return { kind: 'handle', handle: 'start' };
    }
    return null;
  }

  /**
   * Captures a menu press or teardrop handle drag on pointer down.
   * Menu actions wait until pointer up so touch events carry browser user
   * activation and users can cancel by sliding off the button.
   *
   * @param {number} x
   * @param {number} y
   */
  function onPointerDown(x, y) {
    const hit = hitTest(x, y);
    if (!hit) {
      pressedMenuAction = null;
      activeActionId = null;
      return { handled: false, hit: null, actionPromise: null };
    }
    if (hit.kind === 'menu') {
      pressedMenuAction = hit.action;
      activeActionId = hit.action;
      notify();
      return { handled: true, hit, actionPromise: null };
    }
    draggingHandle = hit.handle;
    pressedMenuAction = null;
    activeActionId = null;
    notify();
    return { handled: true, hit, actionPromise: null };
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  function onPointerMove(x, y) {
    if (draggingHandle) {
      options.onDragHandle?.(draggingHandle, x, y);
      notify();
      return true;
    }
    if (pressedMenuAction) {
      const hit = hitTest(x, y);
      const nextActive =
        hit && hit.kind === 'menu' && hit.action === pressedMenuAction
          ? pressedMenuAction
          : null;
      if (nextActive !== activeActionId) {
        activeActionId = nextActive;
        notify();
      }
      return true;
    }
    return false;
  }

  /**
   * Finishes a handle drag or invokes a menu action on pointer up when the
   * release point remains on the pressed button. Runs synchronously inside the
   * `pointerup` user-activation stack.
   *
   * @param {number} [x]
   * @param {number} [y]
   */
  function onPointerUp(x, y) {
    const wasDragging = draggingHandle !== null;
    const pendingAction = pressedMenuAction;
    draggingHandle = null;
    pressedMenuAction = null;
    activeActionId = null;

    if (pendingAction) {
      const hit =
        typeof x === 'number' && typeof y === 'number' ? hitTest(x, y) : null;
      const confirmed =
        hit !== null && hit.kind === 'menu' && hit.action === pendingAction;
      notify();
      if (confirmed) {
        const actionPromise = Promise.resolve(
          options.onAction?.(pendingAction)
        );
        return {
          handled: true,
          action: pendingAction,
          cancelled: false,
          actionPromise,
        };
      }
      return {
        handled: true,
        action: null,
        cancelled: true,
        actionPromise: null,
      };
    }

    if (wasDragging) {
      notify();
      return {
        handled: true,
        action: null,
        cancelled: false,
        actionPromise: null,
      };
    }
    return {
      handled: false,
      action: null,
      cancelled: false,
      actionPromise: null,
    };
  }

  /**
   * Clears active handle drag and pressed menu state on pointer cancel.
   */
  function onPointerCancel() {
    const hadState =
      draggingHandle !== null ||
      pressedMenuAction !== null ||
      activeActionId !== null;
    draggingHandle = null;
    pressedMenuAction = null;
    activeActionId = null;
    if (hadState) {
      notify();
      return true;
    }
    return false;
  }

  return {
    getLayout,
    hitTest,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    isDragging: () => draggingHandle !== null,
    getActiveActionId: () => activeActionId,
    getPressedMenuAction: () => pressedMenuAction,
  };
}
