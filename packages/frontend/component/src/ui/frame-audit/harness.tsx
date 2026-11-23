import '../../theme';

import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import * as stories from './frame-audit.stories';

type Story = Exclude<(typeof stories)[keyof typeof stories], { title: string }>;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Layout may place a box on fractional pixels (three `flex: 1` cells in 470px),
 * but the browser paints its edges on the device pixel grid. Each edge is
 * rounded on its own, as painted, so adjacent boxes stay adjacent and the
 * `pixel-alignment` rule reports only what native layout can get wrong.
 */
const rectOf = ({ left, top, right, bottom }: DOMRect): Rect => {
  const snap = (edge: number) =>
    Math.round(edge * devicePixelRatio) / devicePixelRatio;
  const [x, y] = [snap(left), snap(top)];
  return { x, y, width: snap(right) - x, height: snap(bottom) - y };
};

const intersect = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
};

const CURSORS: Record<string, string> = {
  default: 'default',
  pointer: 'pointer',
  text: 'text',
  grab: 'grab',
  'not-allowed': 'not_allowed',
};

function contentMask(el: Element, viewport: Rect) {
  let mask = viewport;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (getComputedStyle(p).overflow !== 'visible') {
      mask = intersect(mask, rectOf(p.getBoundingClientRect()));
    }
  }
  return mask;
}

function effectiveOpacity(el: Element) {
  let opacity = 1;
  for (let p: Element | null = el; p; p = p.parentElement) {
    opacity *= Number(getComputedStyle(p).opacity);
  }
  return opacity;
}

function firstBaseline(el: HTMLElement) {
  const probe = document.createElement('span');
  probe.style.cssText =
    'display:inline-block;width:0;height:0;vertical-align:baseline';
  el.prepend(probe);
  const baseline = probe.getBoundingClientRect().bottom;
  probe.remove();
  return baseline;
}

function textMetrics(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = [...range.getClientRects()];
  const style = getComputedStyle(el);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const lineCount = new Set(lines.map(r => Math.round(r.top))).size;
  return {
    first_baseline: firstBaseline(el),
    first_line: { ...rectOf(el.getBoundingClientRect()), height: lineHeight },
    line_count: lineCount,
    overflowed:
      el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
    ellipsis_allowed:
      Object.hasOwn(el.dataset, 'auditEllipsis') &&
      style.textOverflow === 'ellipsis' &&
      style.overflowX !== 'visible',
  };
}

function snapshotElement(el: HTMLElement, viewport: Rect) {
  const style = getComputedStyle(el);
  const footer = el.dataset.auditFooter?.split(':');
  const parent = el.parentElement?.closest<HTMLElement>('[data-audit-id]');
  const interactive = el.matches('button, a[href], input, [role="button"]');
  const isText = Object.hasOwn(el.dataset, 'auditText');
  return {
    id: el.dataset.auditId,
    parent_id: parent?.dataset.auditId ?? null,
    callsite: `frame-audit.stories.tsx#${el.dataset.auditId}`,
    bounds: rectOf(el.getBoundingClientRect()),
    content_mask: contentMask(el, viewport),
    opacity: effectiveOpacity(el),
    interactive,
    focused: document.activeElement === el,
    corner_radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
    padding: Number.parseFloat(style.paddingLeft) || 0,
    text: isText ? el.textContent : null,
    role: el.dataset.auditRole ?? 'generic',
    cursor: CURSORS[style.cursor] ?? null,
    selectable: isText && style.userSelect !== 'none',
    text_metrics: isText ? textMetrics(el) : null,
    baseline_group: el.dataset.auditBaseline ?? null,
    footer: footer ? { group: footer[0], priority: Number(footer[1]) } : null,
  };
}

/** The element receiving pointer events at a point, as an audited id. */
function hitProbe(x: number, y: number) {
  const receiver = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>('[data-audit-id]');
  return { x, y, receiver: receiver?.dataset.auditId ?? null };
}

function snapshotFrame(host: HTMLElement) {
  const viewport = {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const nodes = [...host.querySelectorAll<HTMLElement>('[data-audit-id]')];
  const elements = Object.fromEntries(
    nodes.map(el => [el.dataset.auditId, snapshotElement(el, viewport)])
  );
  const hit_probes = nodes
    .filter(el => el.dataset.auditRole === 'overlay' || el.matches('button'))
    .map(el => {
      const box = el.getBoundingClientRect();
      return hitProbe(box.x + box.width / 2, box.y + box.height / 2);
    });
  return { viewport, scale_factor: 1, elements, hit_probes };
}

const nextFrame = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

/** A real style change on one rendered element, captured as its own frame. */
interface DomCase {
  name: string;
  story: string;
  element: string;
  style: Partial<CSSStyleDeclaration>;
}

async function captureStories(domCases: DomCase[]) {
  await document.fonts.ready;
  const frames: Record<string, ReturnType<typeof snapshotFrame>> = {};
  const domFrames: typeof frames = {};
  const scenes = Object.entries(stories).filter(
    (entry): entry is [string, Story] => typeof entry[1] === 'function'
  );
  for (const [name, Story] of scenes) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(<Story />));
    await nextFrame();
    frames[name] = snapshotFrame(host);
    for (const domCase of domCases.filter(c => c.story === name)) {
      const target = host.querySelector<HTMLElement>(
        `[data-audit-id="${domCase.element}"]`
      );
      if (!target) throw new Error(`${name}: no ${domCase.element}`);
      const original = target.style.cssText;
      Object.assign(target.style, domCase.style);
      await nextFrame();
      domFrames[domCase.name] = snapshotFrame(host);
      target.style.cssText = original;
    }
    root.unmount();
    host.remove();
  }
  return { frames, domFrames };
}

Object.assign(window, { captureFrameAuditStories: captureStories });
