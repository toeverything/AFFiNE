import '../declare-test-window.js';

import { ConnectorTool } from '@blocksuite/affine/gfx/connector';
import { ShapeTool } from '@blocksuite/affine/gfx/shape';
import type { IPoint, IVec } from '@blocksuite/affine/global/gfx';
import { sleep } from '@blocksuite/affine/global/utils';
import type {
  ConnectorElementModel,
  NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine/model';
import type { ToolOptions } from '@blocksuite/affine/std/gfx';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { Bound } from '../asserts.js';
import { clickView } from './click.js';
import { dragBetweenCoords } from './drag.js';
import {
  pressBackspace,
  pressEnter,
  pressEscape,
  selectAllByKeyboard,
  SHIFT_KEY,
  SHORT_KEY,
  type,
} from './keyboard.js';
import {
  enterPlaygroundRoom,
  getEditorLocator,
  initEmptyEdgelessState,
  resetHistory,
  waitNextFrame,
} from './misc.js';

const rotWith = (A: number[], C: number[], r = 0): number[] => {
  if (r === 0) return A;

  const s = Math.sin(r);
  const c = Math.cos(r);

  const px = A[0] - C[0];
  const py = A[1] - C[1];

  const nx = px * c - py * s;
  const ny = px * s + py * c;

  return [nx + C[0], ny + C[1]];
};

const AWAIT_TIMEOUT = 500;
export const ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH = 1200;
export type Point = { x: number; y: number };
export enum Shape {
  Diamond = 'Diamond',
  Ellipse = 'Ellipse',
  'Rounded rectangle' = 'Rounded rectangle',
  Square = 'Square',
  Triangle = 'Triangle',
}

export enum ConnectorMode {
  Straight,
  Orthogonal,
  Curve,
}

export async function getNoteRect(page: Page, noteId: string) {
  const xywh: string | null = await page.evaluate(
    ([noteId]) => {
      const doc = window.collection.getDoc('doc:home')?.getStore();
      const block = doc?.getModelById(noteId);
      if (block?.flavour === 'affine:note') {
        return (block as NoteBlockModel).xywh;
      } else {
        return null;
      }
    },
    [noteId] as const
  );
  expect(xywh).not.toBeNull();
  const [x, y, w, h] = JSON.parse(xywh as string);
  return { x, y, w, h };
}

export async function getNoteProps(page: Page, noteId: string) {
  const props = await page.evaluate(
    ([id]) => {
      const doc = window.collection.getDoc('doc:home')?.getStore();
      const block = doc?.getModelById(id);
      if (block?.flavour === 'affine:note') {
        return (block as NoteBlockModel).keys.reduce(
          (pre, key) => {
            pre[key] = block[key as keyof typeof block] as string;
            return pre;
          },
          {} as Record<string, string | number>
        );
      } else {
        return null;
      }
    },
    [noteId] as const
  );
  return props;
}

export async function extendFormatBar(page: Page) {
  await page.click('sl-button:text("Test Operations")');
  await page.click('sl-menu-item:text("Extend Format Bar")');
  await waitNextFrame(page);
}

export async function toggleFramePanel(page: Page) {
  await page.click('sl-button:text("Test Operations")');
  await page.click('sl-menu-item:text("Toggle Frame Panel")');
  await waitNextFrame(page);
}

export async function toggleMultipleEditors(page: Page) {
  await page.click('sl-button:text("Test Operations")');
  await page.click('sl-menu-item:text("Toggle Multiple Editors")');
  await waitNextFrame(page);
}

export async function switchEditorMode(page: Page) {
  await page.click('sl-tooltip[content="Switch Editor"]');
  // FIXME: listen to editor loaded event
  await waitNextFrame(page);
}

export async function switchMultipleEditorsMode(page: Page) {
  await page.evaluate(() => {
    const containers = document.querySelectorAll('affine-editor-container');
    const mode = containers[0].mode === 'edgeless' ? 'page' : 'edgeless';

    containers.forEach(container => {
      container.mode = mode;
    });
  });
}

export async function switchEditorEmbedMode(page: Page) {
  await page.click('sl-button:text("Test Operations")');
  await page.click('sl-menu-item:text("Switch Offset Mode")');
}

export async function enterPresentationMode(page: Page) {
  await page.click('sl-tooltip[content="Enter presentation mode"]');
  await waitNextFrame(page);
}

export async function toggleEditorReadonly(page: Page) {
  await page.click('sl-button:text("Test Operations")');
  await page.click('sl-menu-item:text("Toggle Readonly")');
  await waitNextFrame(page);
}

type EdgelessTool =
  | 'default'
  | 'pan'
  | 'note'
  | 'shape'
  | 'pen'
  | 'brush'
  | 'highlighter'
  | 'eraser'
  | 'text'
  | 'connector'
  | 'frame'
  | 'frameNavigator';
type ZoomToolType = 'zoomIn' | 'zoomOut' | 'fitToScreen';
type ComponentToolType = 'shape' | 'thin' | 'thick' | 'brush' | 'more';

type PresentationToolType = 'previous' | 'next';

const locatorEdgelessToolButtonSenior = async (
  page: Page,
  selector: string
): Promise<Locator> => {
  const target = page.locator(selector);
  const visible = await target.isVisible();
  if (visible) return target;
  // try to click next page
  const nextButton = page.locator(
    '.senior-nav-button-wrapper.next > icon-button'
  );
  const nextExists = await nextButton.count();
  const isDisabled =
    (await nextButton.getAttribute('data-test-disabled')) === 'true';
  if (!nextExists || isDisabled) return target;
  await nextButton.click();
  await page.waitForTimeout(200);
  return locatorEdgelessToolButtonSenior(page, selector);
};

export async function locatorEdgelessToolButton(
  page: Page,
  type: EdgelessTool,
  innerContainer = true
) {
  const selector = {
    default: '.edgeless-default-button',
    pan: '.edgeless-default-button',
    shape: '.edgeless-shape-button',
    pen: '.edgeless-pen-button',
    brush: '.edgeless-brush-button',
    highlighter: '.edgeless-highlighter-button',
    eraser: '.edgeless-eraser-button',
    text: '.edgeless-mindmap-button',
    connector: '.edgeless-connector-button',
    note: '.edgeless-note-button',
    frame: '.edgeless-frame-button',
    frameNavigator: '.edgeless-frame-navigator-button',
  }[type];

  let buttonType;
  switch (type) {
    case 'brush':
    case 'highlighter':
      buttonType = 'edgeless-tool-icon-button';
      break;
    case 'pen':
    case 'text':
    case 'eraser':
    case 'shape':
    case 'note':
      buttonType = 'edgeless-toolbar-button';
      break;
    default:
      buttonType = 'edgeless-tool-icon-button';
  }
  // TODO: quickTool locator is different
  const button = await locatorEdgelessToolButtonSenior(
    page,
    `edgeless-toolbar-widget ${buttonType}${selector}`
  );

  return innerContainer ? button.locator('.icon-container') : button;
}

export async function toggleZoomBarWhenSmallScreenWidth(page: Page) {
  const toggleZoomBarButton = page.locator(
    '.toggle-button edgeless-tool-icon-button'
  );
  const isClosed = (await toggleZoomBarButton.count()) === 1;
  if (isClosed) {
    await toggleZoomBarButton.click();
    await page.waitForTimeout(200);
  }
}

export async function locatorEdgelessZoomToolButton(
  page: Page,
  type: ZoomToolType,
  innerContainer = true
) {
  const text = {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fitToScreen: 'Fit to screen',
  }[type];

  const screenWidth = page.viewportSize()?.width ?? 0;
  let zoomBarClass = 'horizontal';
  if (screenWidth < ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH) {
    await toggleZoomBarWhenSmallScreenWidth(page);
    zoomBarClass = 'vertical';
  }

  const button = page
    .locator(
      `.edgeless-zoom-toolbar-container.${zoomBarClass} edgeless-tool-icon-button`
    )
    .filter({
      hasText: text,
    });

  return innerContainer ? button.locator('.icon-container') : button;
}

export function locatorEdgelessComponentToolButton(
  page: Page,
  type: ComponentToolType,
  innerContainer = true
) {
  const text = {
    shape: 'Shape',
    brush: 'Color',
    thin: 'Thin',
    thick: 'Thick',
    more: 'More',
  }[type];
  const button = page
    .locator('affine-toolbar-widget editor-toolbar editor-icon-button')
    .filter({
      hasText: text,
    });

  return innerContainer ? button.locator('.icon-container') : button;
}

export function locatorPresentationToolbarButton(
  page: Page,
  type: PresentationToolType
) {
  const text = {
    previous: 'Previous',
    next: 'Next',
  }[type];
  const button = page
    .locator('presentation-toolbar edgeless-tool-icon-button')
    .filter({
      hasText: text,
    });

  return button;
}

export async function setEdgelessTool(
  page: Page,
  mode: EdgelessTool,
  shape = Shape.Square
) {
  switch (mode) {
    // text tool is removed, use shortcut to trigger
    case 'text':
      await page.keyboard.press('t', { delay: 100 });
      break;
    case 'default': {
      const button = await locatorEdgelessToolButton(page, 'default', false);
      const classes = (await button.getAttribute('class'))?.split(' ');
      if (!classes?.includes('default')) {
        await button.click();
        await sleep(100);
      }
      break;
    }
    case 'pan': {
      const button = await locatorEdgelessToolButton(page, 'default', false);
      const classes = (await button.getAttribute('class'))?.split(' ');
      if (classes?.includes('default')) {
        await button.click();
        await sleep(100);
      } else if (classes?.includes('pan')) {
        await button.click(); // change to default
        await sleep(100);
        await button.click(); // change to pan
        await sleep(100);
      }
      break;
    }
    case 'brush':
    case 'highlighter': {
      const penButton = await locatorEdgelessToolButton(page, 'pen', false);
      await penButton.click();

      await page.waitForTimeout(250);

      const button = await locatorEdgelessToolButton(page, mode, false);
      await button.click();

      break;
    }
    case 'note':
    case 'eraser':
    case 'frame':
    case 'connector': {
      const button = await locatorEdgelessToolButton(page, mode, false);
      await button.click();
      break;
    }
    case 'shape': {
      const shapeToolButton = await locatorEdgelessToolButton(
        page,
        'shape',
        false
      );
      // Avoid clicking on the shape-element (will trigger dragging mode)
      await shapeToolButton.click({ position: { x: 5, y: 5 } });

      const squareShapeButton = page
        .locator('edgeless-slide-menu edgeless-tool-icon-button')
        .filter({ hasText: shape });
      await squareShapeButton.click();
      break;
    }
  }
}
export type ShapeName =
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'roundedRect';

export async function assertEdgelessShapeType(page: Page, type: ShapeName) {
  const curType = await page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) {
      throw new Error('Missing edgeless page');
    }
    const tool = container.gfx.tool.currentToolOption$.peek();
    if (tool.toolType?.toolName !== 'shape')
      throw new Error('Expected shape tool');

    return (tool.options as ToolOptions<ShapeTool>).shapeName;
  });

  expect(type).toEqual(curType);
}

export async function assertEdgelessTool(page: Page, mode: string) {
  await page.waitForTimeout(1000);
  const type = await page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) {
      throw new Error('Missing edgeless page');
    }
    return container.gfx.tool.currentTool$.peek()?.toolName;
  });
  expect(type).toEqual(mode);
}

export async function getConnectorLabel(page: Page, id: string) {
  const text = await page.evaluate(id => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) {
      throw new Error('Missing edgeless page');
    }
    const connector = container.gfx.getElementById(id) as ConnectorElementModel;
    if (!connector) {
      throw new Error('Missing connector');
    }

    return connector.text?.toString() ?? '';
  }, id);

  return text;
}

export async function assertEdgelessConnectorToolMode(
  page: Page,
  mode: ConnectorMode
) {
  const [toolName, toolOptions] = await page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) {
      throw new Error('Missing edgeless page');
    }
    const tool = container.gfx.tool.currentToolOption$.peek();
    return [
      tool.toolType?.toolName as string | undefined,
      tool.options as ToolOptions<ConnectorTool>,
    ];
  });
  if (toolName !== 'connector') {
    throw new Error('Expected connector tool');
  }
  expect((toolOptions as ToolOptions<ConnectorTool>).mode).toEqual(mode);
}

export async function getEdgelessBlockChild(page: Page) {
  const block = page.locator('affine-edgeless-note');
  const blockBox = await block.boundingBox();
  if (blockBox === null) throw new Error('Missing edgeless block child rect');
  return blockBox;
}

export async function getEdgelessSelectedRect(page: Page) {
  const selectedBox = await page.evaluate(() => {
    const selected = document
      .querySelector('edgeless-selected-rect')
      ?.shadowRoot?.querySelector('.affine-edgeless-selected-rect');
    if (!selected) {
      throw new Error('Missing edgeless selected rect');
    }
    return selected.getBoundingClientRect();
  });
  return selectedBox;
}

export async function getEdgelessSelectedRectModel(page: Page): Promise<Bound> {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    const bound = container.service.selection.selectedBound;
    return [bound.x, bound.y, bound.w, bound.h];
  });
}

export async function decreaseZoomLevel(page: Page) {
  const btn = await locatorEdgelessZoomToolButton(page, 'zoomOut', false);
  await btn.click();
  await sleep(AWAIT_TIMEOUT);
}

export async function increaseZoomLevel(page: Page) {
  const btn = await locatorEdgelessZoomToolButton(page, 'zoomIn', false);
  await btn.click();
  await sleep(AWAIT_TIMEOUT);
}

export async function autoFit(page: Page) {
  const btn = await locatorEdgelessZoomToolButton(page, 'fitToScreen', false);
  await btn.click();
  await sleep(AWAIT_TIMEOUT);
}

export async function addBasicBrushElement(
  page: Page,
  start: Point,
  end: Point,
  auto = true
) {
  await setEdgelessTool(page, 'brush');
  await dragBetweenCoords(page, start, end, { steps: 100 });
  auto && (await setEdgelessTool(page, 'default'));
}

export async function addBasicRectShapeElement(
  page: Page,
  start: Point,
  end: Point
) {
  await setEdgelessTool(page, 'shape');
  await dragBetweenCoords(page, start, end, { steps: 50 });
}

export async function addBasicShapeElement(
  page: Page,
  start: Point,
  end: Point,
  shape: Shape
) {
  await setEdgelessTool(page, 'shape', shape);
  await dragBetweenCoords(page, start, end, { steps: 50 });
  return (await getSelectedIds(page))[0];
}

export async function addBasicConnectorElement(
  page: Page,
  start: Point,
  end: Point
) {
  await setEdgelessTool(page, 'connector');
  await dragBetweenCoords(page, start, end, { steps: 100 });
  return (await getSelectedIds(page))[0];
}

export async function addBasicFrameElement(
  page: Page,
  start: Point,
  end: Point
) {
  await setEdgelessTool(page, 'frame');
  await dragBetweenCoords(page, start, end, { steps: 50 });
}

export async function addBasicEdgelessText(
  page: Page,
  text: string,
  x: number,
  y: number
) {
  await setEdgelessTool(page, 'text');
  await page.mouse.click(x, y);
  await page.locator('affine-edgeless-text').waitFor({ state: 'visible' });
  await waitNextFrame(page, 100);
  await type(page, text, 20);
  await pressEscape(page, 2);
  await setEdgelessTool(page, 'default');
}

export async function addNote(page: Page, text: string, x: number, y: number) {
  await setEdgelessTool(page, 'note');
  await page.mouse.click(x, y);
  await waitNextFrame(page);

  const paragraphs = text.split('\n');
  let i = 0;
  for (const paragraph of paragraphs) {
    ++i;
    await type(page, paragraph, 20);

    if (i < paragraphs.length) {
      await pressEnter(page);
    }
  }

  const { id } = await page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');

    return {
      id: container.service.selection.selectedIds[0],
    };
  });

  return id;
}

export async function exitEditing(page: Page) {
  await page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');

    container.service.selection.set({
      elements: [],
      editing: false,
    });
  });
}

export async function resizeElementByHandle(
  page: Page,
  delta: Point,
  corner:
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'top-left'
    | 'top-right'
    | 'bottom-right'
    | 'bottom-left' = 'top-left',
  steps = 1,
  beforeMouseUp?: () => Promise<void>
) {
  const handle = page.locator(`.handle[aria-label="${corner}"] .resize`);
  const box = await handle.boundingBox();
  if (box === null) throw new Error();
  const xOffset = box.width / 2;
  const yOffset = box.height / 2;

  await dragBetweenCoords(
    page,
    { x: box.x + xOffset, y: box.y + yOffset },
    { x: box.x + delta.x + xOffset, y: box.y + delta.y + yOffset },
    {
      steps,
      beforeMouseUp,
    }
  );
}

export async function rotateElementByHandle(
  page: Page,
  deg = 0,
  corner:
    | 'top-left'
    | 'top-right'
    | 'bottom-right'
    | 'bottom-left' = 'top-left',
  steps = 1
) {
  const rect = await page
    .locator('.affine-edgeless-selected-rect')
    .boundingBox();
  if (rect === null) throw new Error();
  const box = await page
    .locator(`.handle[aria-label="${corner}"] .rotate`)
    .boundingBox();
  if (box === null) throw new Error();

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  const t = rotWith([x, y], [cx, cy], (deg * Math.PI) / 180);

  await dragBetweenCoords(
    page,
    { x, y },
    { x: t[0], y: t[1] },
    {
      steps,
    }
  );
}

export async function selectBrushColor(page: Page, label: string) {
  const colorButton = page
    .locator('edgeless-pen-menu')
    .locator('edgeless-color-panel')
    .locator(`.color-unit[aria-label="${label}"]`);
  await colorButton.click();
}

export async function selectBrushSize(page: Page, size: string) {
  const sizeIndexMap: Record<string, number> = {
    two: 1,
    four: 2,
    six: 3,
    eight: 4,
    ten: 5,
    twelve: 6,
  };
  const sizeButton = page.locator(
    `edgeless-pen-menu edgeless-line-width-panel .point-button:nth-child(${sizeIndexMap[size]})`
  );
  await sizeButton.click();
}

export async function pickColorAtPoints(page: Page, points: number[][]) {
  const pickedColors: `#${string}`[] = await page.evaluate(points => {
    const node = document.querySelector(
      '.affine-edgeless-surface-block-container canvas'
    ) as HTMLCanvasElement;
    const w = node.width;
    const h = node.height;
    const ctx = node?.getContext('2d');
    if (!ctx) throw new Error('Cannot get canvas context');
    const pixelData = ctx.getImageData(0, 0, w, h).data;

    const colors = points.map(([x, y]) => {
      const startPosition = (y * w + x) * 4;
      return ('#' +
        (
          (1 << 24) +
          (pixelData[startPosition] << 16) +
          (pixelData[startPosition + 1] << 8) +
          pixelData[startPosition + 2]
        )
          .toString(16)
          .slice(1)) as `#${string}`;
    });
    return colors;
  }, points);
  return pickedColors;
}

export async function getNoteBoundBoxInEdgeless(page: Page, noteId: string) {
  const editor = getEditorLocator(page);
  const note = editor.locator(
    `affine-edgeless-note[data-block-id="${noteId}"]`
  );
  const bound = await note.boundingBox();
  if (!bound) {
    throw new Error(`Missing note: ${noteId}`);
  }
  return bound;
}

export async function getAllNoteIds(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('affine-note')).map(
      note => note.model.id
    );
  });
}

export async function getAllEdgelessNoteIds(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('affine-edgeless-note')).map(
      note => note.model.id
    );
  });
}

export async function getAllEdgelessTextIds(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('affine-edgeless-text')).map(
      text => text.model.id
    );
  });
}

export async function countBlock(page: Page, flavour: string) {
  return page.evaluate(
    ([flavour]) => {
      return Array.from(document.querySelectorAll(flavour)).length;
    },
    [flavour]
  );
}

export async function activeNoteInEdgeless(page: Page, noteId: string) {
  const bound = await getNoteBoundBoxInEdgeless(page, noteId);
  await page.mouse.dblclick(
    bound.x + bound.width / 2,
    bound.y + bound.height / 2
  );
}

export async function selectNoteInEdgeless(page: Page, noteId: string) {
  const bound = await getNoteBoundBoxInEdgeless(page, noteId);
  await page.mouse.click(bound.x + bound.width / 2, bound.y + bound.height / 2);
}

export function locatorNoteDisplayModeButton(
  page: Page,
  mode: NoteDisplayMode
) {
  return page.locator('note-display-mode-panel').locator(`.item.${mode}`);
}

export function locatorScalePanelButton(page: Page, scale: number) {
  return page.locator('affine-size-dropdown-menu').getByLabel(String(scale));
}

export async function changeNoteDisplayMode(page: Page, mode: NoteDisplayMode) {
  const button = locatorNoteDisplayModeButton(page, mode);
  await button.click();
}

export async function changeNoteDisplayModeWithId(
  page: Page,
  noteId: string,
  mode: NoteDisplayMode
) {
  await selectNoteInEdgeless(page, noteId);
  await triggerComponentToolbarAction(page, 'changeNoteDisplayMode');
  await waitNextFrame(page);
  await changeNoteDisplayMode(page, mode);
}

export async function updateExistedBrushElementSize(
  page: Page,
  nthSizeButton: 1 | 2 | 3 | 4 | 5 | 6
) {
  // get the nth brush size button
  const btn = page.locator(
    `edgeless-line-width-panel .point-button:nth-child(${nthSizeButton})`
  );

  await btn.click();
}

export async function openComponentToolbarMoreMenu(page: Page) {
  const btn = page
    .locator('affine-toolbar-widget editor-toolbar')
    .getByLabel('More menu');

  await btn.click();
}

export async function clickComponentToolbarMoreMenuButton(
  page: Page,
  button: 'delete'
) {
  const text = {
    delete: 'Delete',
  }[button];

  const btn = locatorComponentToolbarMoreButton(page)
    .locator('editor-menu-action')
    .filter({ hasText: text });

  await btn.click();
}

// stepX/Y may not equal to wheel event delta.
// Chromium reports deltaX/deltaY scaled by host device scale factor.
// https://bugs.chromium.org/p/chromium/issues/detail?id=1324819
export async function zoomByMouseWheel(
  page: Page,
  stepX: number,
  stepY: number,
  pressedKey = true
) {
  if (pressedKey) await page.keyboard.down(SHORT_KEY);

  await page.mouse.wheel(stepX, stepY);

  if (pressedKey) await page.keyboard.up(SHORT_KEY);
}

// touch screen is not supported by Playwright now
// use pointer event mock instead
// https://github.com/microsoft/playwright/issues/2903
export async function multiTouchDown(page: Page, points: Point[]) {
  await page.evaluate(points => {
    const target = document.querySelector('affine-edgeless-root');
    if (!target) {
      throw new Error('Missing edgeless page');
    }
    points.forEach((point, index) => {
      const clientX = point.x;
      const clientY = point.y;

      target.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX,
          clientY,
          bubbles: true,
          pointerType: 'touch',
          pointerId: index,
          isPrimary: index === 0,
        })
      );
    });
  }, points);
}

export async function multiTouchMove(
  page: Page,
  from: Point[],
  to: Point[],
  step = 5
) {
  await page.evaluate(
    async ({ from, to, step }) => {
      const target = document.querySelector('affine-edgeless-root');
      if (!target) {
        throw new Error('Missing edgeless page');
      }

      if (from.length !== to.length) {
        throw new Error('from and to should have the same length');
      }

      if (step !== 0) {
        for (const [i] of Array.from({ length: step }).entries()) {
          from.forEach((point, index) => {
            const clientX =
              point.x + ((to[index].x - point.x) / step) * (i + 1);
            const clientY =
              point.y + ((to[index].y - point.y) / step) * (i + 1);

            target.dispatchEvent(
              new PointerEvent('pointermove', {
                clientX,
                clientY,
                bubbles: true,
                pointerType: 'touch',
                pointerId: index,
                isPrimary: index === 0,
              })
            );
          });
          await new Promise(resolve => setTimeout(resolve, 16));
        }
      }
    },
    { from, to, step }
  );
}

export async function multiTouchUp(page: Page, points: Point[]) {
  await page.evaluate(points => {
    const target = document.querySelector('affine-edgeless-root');
    if (!target) {
      throw new Error('Missing edgeless page');
    }
    points.forEach((point, index) => {
      const clientX = point.x;
      const clientY = point.y;

      target.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX,
          clientY,
          bubbles: true,
          pointerType: 'touch',
          pointerId: index,
          isPrimary: index === 0,
        })
      );
    });
  }, points);
}

export async function zoomFitByKeyboard(page: Page) {
  await page.keyboard.press(`Alt+1`, { delay: 100 });
  await waitNextFrame(page, 300);
}

export async function zoomOutByKeyboard(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+-`, { delay: 100 });
  await waitNextFrame(page, 300);
}

export async function zoomResetByKeyboard(page: Page) {
  await page.keyboard.press(`Alt+0`, { delay: 50 });
  // Wait for animation
  await waitNextFrame(page, 300);
}

export async function zoomToSelection(page: Page) {
  await page.keyboard.press(`Alt+2`, { delay: 50 });
  // Wait for animation
  await waitNextFrame(page, 300);
}

export async function zoomInByKeyboard(page: Page) {
  await page.keyboard.press(`${SHORT_KEY}+=`, { delay: 50 });
  await waitNextFrame(page, 300);
}

export async function getZoomLevel(page: Page) {
  const screenWidth = page.viewportSize()?.width ?? 0;
  let zoomBarClass = 'horizontal';
  if (screenWidth < ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH) {
    await toggleZoomBarWhenSmallScreenWidth(page);
    zoomBarClass = 'vertical';
  }
  const span = page.locator(
    `.edgeless-zoom-toolbar-container.${zoomBarClass} .zoom-percent`
  );
  await waitNextFrame(page);
  const text = await span.textContent();
  if (!text) {
    throw new Error('Missing .zoom-percent');
  }
  return Number(text.replace('%', ''));
}

export async function getViewportCenter(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const target = document.querySelector('affine-edgeless-root');
    if (!target) {
      throw new Error('Missing edgeless page');
    }
    return [target.gfx.viewport.centerX, target.gfx.viewport.centerY];
  });
}
export async function setViewportCenter(page: Page, center: [number, number]) {
  await page.evaluate(center => {
    const target = document.querySelector('affine-edgeless-root');
    if (!target) {
      throw new Error('Missing edgeless page');
    }
    target.gfx.viewport.setCenter(center[0], center[1]);
  }, center);
}

export async function optionMouseDrag(
  page: Page,
  start: number[],
  end: number[]
) {
  start = await toViewCoord(page, start);
  end = await toViewCoord(page, end);
  await page.keyboard.down('Alt');
  await dragBetweenCoords(
    page,
    { x: start[0], y: start[1] },
    { x: end[0], y: end[1] },
    { steps: 30 }
  );
  await page.keyboard.up('Alt');
}

export async function shiftClick(page: Page, point: IPoint) {
  await page.keyboard.down(SHIFT_KEY);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up(SHIFT_KEY);
}

export async function shiftClickView(page: Page, point: [number, number]) {
  await page.keyboard.down(SHIFT_KEY);
  await clickView(page, point);
  await page.keyboard.up(SHIFT_KEY);
}

export async function deleteAll(page: Page) {
  await clickView(page, [0, 0]);
  await selectAllByKeyboard(page);
  await pressBackspace(page);
}

export async function deleteAllConnectors(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    container.service.crud.getElementsByType('connector').forEach(c => {
      container.service.crud.removeElement(c.id);
    });
  });
}

export function locatorComponentToolbar(page: Page) {
  return page.locator('affine-toolbar-widget editor-toolbar');
}

export function locatorComponentToolbarMoreButton(page: Page) {
  const moreButton = locatorComponentToolbar(page).getByLabel('More menu');
  return moreButton;
}
type Action =
  | 'bringToFront'
  | 'bringForward'
  | 'sendBackward'
  | 'sendToBack'
  | 'copyAsPng'
  | 'changeNoteStyle'
  | 'changeShapeStyle'
  | 'changeShapeColor'
  | 'changeShapeFillColor'
  | 'changeShapeStrokeColor'
  | 'changeShapeStrokeStyles'
  | 'changeConnectorStrokeStyles'
  | 'changeConnectorShape'
  | 'addFrame'
  | 'addGroup'
  | 'addMindmap'
  | 'createGroupOnMoreOption'
  | 'ungroup'
  | 'releaseFromGroup'
  | 'createFrameOnMoreOption'
  | 'duplicate'
  | 'renameGroup'
  | 'autoSize'
  | 'changeNoteDisplayMode'
  | 'changeNoteSlicerSetting'
  | 'changeNoteScale'
  | 'addText'
  | 'quickConnect'
  | 'turnIntoLinkedDoc'
  | 'createLinkedDoc'
  | 'openLinkedDoc'
  | 'toCardView'
  | 'toEmbedView'
  | 'autoArrange'
  | 'autoResize';

export async function triggerShapeSwitch(
  page: Page,
  type: 'Square' | 'Ellipse' | 'Diamond' | 'Triangle' | 'Rounded rectangle'
) {
  const button = locatorComponentToolbar(page)
    .getByLabel('Switch shape type')
    .first();
  await button.click();

  const shapeButton = locatorComponentToolbar(page).getByLabel(type);
  await shapeButton.click();
}

export async function triggerComponentToolbarAction(
  page: Page,
  action: Action
) {
  switch (action) {
    case 'bringToFront': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Bring to Front',
      });
      await actionButton.click();
      break;
    }
    case 'bringForward': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Bring Forward',
      });
      await actionButton.click();
      break;
    }
    case 'sendBackward': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Send Backward',
      });
      await actionButton.click();
      break;
    }
    case 'sendToBack': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Send to Back',
      });
      await actionButton.click();
      break;
    }
    case 'copyAsPng': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Copy as PNG',
      });
      await actionButton.click();
      break;
    }
    case 'createFrameOnMoreOption': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Frame Section',
      });
      await actionButton.click();
      break;
    }
    case 'duplicate': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Duplicate',
      });
      await actionButton.click();
      break;
    }
    case 'changeShapeColor':
    case 'changeShapeFillColor':
    case 'changeShapeStrokeColor':
    case 'changeShapeStrokeStyles': {
      const button = locatorComponentToolbar(page)
        .locator('edgeless-shape-color-picker')
        .getByLabel(/^Color$/);
      await button.click();
      break;
    }
    case 'changeShapeStyle': {
      const button = locatorComponentToolbar(page).getByLabel(/^Style$/);
      await button.click();
      break;
    }
    case 'changeConnectorStrokeStyles': {
      const button = locatorComponentToolbar(page).getByLabel('Stroke style');
      await button.click();
      break;
    }
    case 'changeConnectorShape': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Shape',
      });
      await button.click();
      break;
    }
    case 'addFrame': {
      const button = locatorComponentToolbar(page).getByLabel(/^Frame$/);
      await button.click();
      break;
    }
    case 'addGroup': {
      const button = locatorComponentToolbar(page).getByLabel(/^Group$/);
      await button.click();
      break;
    }
    case 'addMindmap': {
      const button = page.locator('edgeless-mindmap-tool-button');
      await button.click();
      const mindMapMenu = page.locator('edgeless-mindmap-menu');
      const mindMapItem = mindMapMenu.locator('.mindmap-item').first();
      await mindMapItem.click();
      await page.mouse.move(400, 400);
      await page.mouse.click(400, 400);
      break;
    }
    case 'createGroupOnMoreOption': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Group Section',
      });
      await actionButton.click();
      break;
    }
    case 'ungroup': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Ungroup',
      });
      await button.click();
      break;
    }
    case 'renameGroup': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Rename',
      });
      await button.click();
      break;
    }
    case 'releaseFromGroup': {
      const button =
        locatorComponentToolbar(page).getByLabel('Release from group');
      await button.click();
      break;
    }
    case 'changeNoteStyle': {
      const button = locatorComponentToolbar(page).locator(
        'edgeless-note-style-panel'
      );
      await button.click();
      break;
    }
    case 'changeNoteDisplayMode': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Mode',
      });
      await button.click();
      break;
    }
    case 'changeNoteSlicerSetting': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Slicer',
      });
      await button.click();
      break;
    }
    case 'changeNoteScale': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Scale',
      });
      await button.click();
      break;
    }
    case 'autoSize': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Size',
      });
      await button.click();
      break;
    }
    case 'addText': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Add text',
      });
      await button.click();
      break;
    }
    case 'quickConnect': {
      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Draw connector',
      });
      await button.click();
      break;
    }
    case 'turnIntoLinkedDoc': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Turn into linked doc',
      });
      await actionButton.click();
      break;
    }
    case 'createLinkedDoc': {
      const moreButton = locatorComponentToolbarMoreButton(page);
      await moreButton.click();

      const actionButton = moreButton.locator('editor-menu-action').filter({
        hasText: 'Create linked doc',
      });
      await actionButton.click();
      break;
    }
    case 'openLinkedDoc': {
      const openButton = locatorComponentToolbar(page).getByRole('button', {
        name: 'Open doc',
      });
      await openButton.click();

      const button = locatorComponentToolbar(page).getByRole('button', {
        name: 'Open this doc',
      });
      await button.click();
      break;
    }
    case 'toCardView': {
      const button = locatorComponentToolbar(page)
        .locator('edgeless-tool-icon-button')
        .filter({
          hasText: 'Card view',
        });
      await button.click();
      break;
    }
    case 'toEmbedView': {
      const button = locatorComponentToolbar(page)
        .locator('edgeless-tool-icon-button')
        .filter({
          hasText: 'Embed view',
        });
      await button.click();
      break;
    }
    case 'autoArrange': {
      const toolbar = locatorComponentToolbar(page);
      const button = toolbar.getByLabel('Align objects');
      await button.click();
      const arrange = toolbar.getByLabel('Auto arrange');
      await arrange.click();
      break;
    }
    case 'autoResize': {
      const toolbar = locatorComponentToolbar(page);
      const button = toolbar.getByLabel('Align objects');
      await button.click();
      const resize = toolbar.getByLabel('Resize & Align');
      await resize.click();
      break;
    }
  }
}

export async function changeEdgelessNoteBackground(page: Page, label: string) {
  const colorButton = page
    .locator('edgeless-note-style-panel')
    .locator('edgeless-color-panel')
    .locator(`.color-unit[aria-label="${label}"]`);
  await colorButton.click();
}

export async function changeShapeFillColor(page: Page, label: string) {
  const colorButton = page
    .locator('edgeless-shape-color-picker')
    .locator('edgeless-color-panel[aria-label="Fill color"]')
    .locator(`.color-unit[aria-label="${label}"]`);
  await colorButton.click({ force: true });
}

export async function changeShapeFillColorToTransparent(page: Page) {
  const colorButton = page
    .locator('edgeless-shape-color-picker')
    .locator('edgeless-color-panel[aria-label="Fill color"]')
    .locator('edgeless-color-custom-button');
  await colorButton.click({ force: true });

  const input = page.locator('edgeless-color-picker').locator('label.alpha');
  await input.focus();
  await input.press('ArrowRight');
  await input.press('ArrowRight');
  await input.press('ArrowRight');
  await input.press('Backspace');
  await input.press('Backspace');
  await input.press('Backspace');
}

export async function changeShapeStrokeColor(page: Page, color: string) {
  const colorButton = page
    .locator('edgeless-shape-color-picker')
    .locator('edgeless-color-panel[aria-label="Border color"]')
    .locator(`.color-unit[aria-label="${color}"]`);
  await colorButton.click();
}

export async function resizeConnectorByStartCapitalHandler(
  page: Page,
  delta: { x: number; y: number },
  steps = 1
) {
  const handler = page.locator(
    '.affine-edgeless-selected-rect .line-controller.line-start'
  );
  const box = await handler.boundingBox();
  if (box === null) throw new Error();
  const offset = 5;
  await dragBetweenCoords(
    page,
    { x: box.x + offset, y: box.y + offset },
    { x: box.x + delta.x + offset, y: box.y + delta.y + offset },
    {
      steps,
    }
  );
}

export function getEdgelessLineWidthPanel(page: Page) {
  return page
    .locator('affine-toolbar-widget editor-toolbar')
    .locator('edgeless-line-width-panel');
}
export async function changeShapeStrokeWidth(page: Page) {
  const lineWidthPanel = getEdgelessLineWidthPanel(page);
  const lineWidthPanelRect = await lineWidthPanel.boundingBox();
  if (!lineWidthPanelRect) {
    throw new Error('lineWidthPanelRect is not found');
  }
  // click line width panel by position
  const x = lineWidthPanelRect.x + 40;
  const y = lineWidthPanelRect.y + 10;
  await page.mouse.click(x, y);
}

export function locatorShapeStrokeStyleButton(
  page: Page,
  mode: 'solid' | 'dash' | 'none'
) {
  return page
    .locator('affine-toolbar-widget editor-toolbar')
    .locator(`.line-style-button.mode-${mode}`);
}

export async function changeShapeStrokeStyle(
  page: Page,
  mode: 'solid' | 'dash' | 'none'
) {
  const button = locatorShapeStrokeStyleButton(page, mode);
  await button.click();
}

export function locatorShapeStyleButton(
  page: Page,
  style: 'general' | 'scribbled'
) {
  return page
    .locator('affine-toolbar-widget editor-toolbar')
    .locator('edgeless-shape-style-panel')
    .getByRole('button', { name: style });
}

export async function changeShapeStyle(
  page: Page,
  style: 'general' | 'scribbled'
) {
  const button = locatorShapeStyleButton(page, style);
  await button.click();
}

export async function changeConnectorStrokeColor(page: Page, color: string) {
  const colorButton = locatorComponentToolbar(page)
    .locator('edgeless-color-panel')
    .getByLabel(color);
  await colorButton.click();
}

export function locatorConnectorStrokeWidthButton(
  page: Page,
  buttonPosition: number
) {
  return locatorComponentToolbar(page)
    .locator('edgeless-line-width-panel')
    .locator(`.point-button:nth-child(${buttonPosition})`);
}
export async function changeConnectorStrokeWidth(
  page: Page,
  buttonPosition: number
) {
  const button = locatorConnectorStrokeWidthButton(page, buttonPosition);
  await button.click();
}

export function locatorConnectorStrokeStyleButton(
  page: Page,
  mode: 'solid' | 'dash' | 'none'
) {
  return locatorComponentToolbar(page).locator(
    `.line-style-button.mode-${mode}`
  );
}
export async function changeConnectorStrokeStyle(
  page: Page,
  mode: 'solid' | 'dash' | 'none'
) {
  const button = locatorConnectorStrokeStyleButton(page, mode);
  await button.click();
}

export async function initThreeOverlapFilledShapes(page: Page) {
  const rect0 = {
    start: { x: 100, y: 100 },
    end: { x: 200, y: 200 },
  };
  await addBasicRectShapeElement(page, rect0.start, rect0.end);
  await page.mouse.click(rect0.start.x + 5, rect0.start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeFillColor');
  await changeShapeFillColor(page, 'LightGreen');

  const rect1 = {
    start: { x: 130, y: 130 },
    end: { x: 230, y: 230 },
  };
  await addBasicRectShapeElement(page, rect1.start, rect1.end);
  await page.mouse.click(rect1.start.x + 5, rect1.start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeFillColor');
  await changeShapeFillColor(page, 'MediumBlue');

  const rect2 = {
    start: { x: 160, y: 160 },
    end: { x: 260, y: 260 },
  };
  await addBasicRectShapeElement(page, rect2.start, rect2.end);
  await page.mouse.click(rect2.start.x + 5, rect2.start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeFillColor');
  await changeShapeFillColor(page, 'White');
}

export async function initThreeOverlapNotes(page: Page, x = 130, y = 140) {
  await addNote(page, 'abc', x, y);
  await addNote(page, 'efg', x + 30, y);
  await addNote(page, 'hij', x + 60, y);
}

export async function initThreeNotes(page: Page) {
  await addNote(page, 'abc', 30 + 100, 40 + 100);
  await addNote(page, 'efg', 30 + 130, 40 + 200);
  await addNote(page, 'hij', 30 + 160, 40 + 300);
}

export async function toViewCoord(page: Page, point: number[]) {
  return page.evaluate(point => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.viewport.toViewCoord(point[0], point[1]);
  }, point);
}

export async function dragBetweenViewCoords(
  page: Page,
  start: number[],
  end: number[],
  options?: Parameters<typeof dragBetweenCoords>[3]
) {
  const [startX, startY] = await toViewCoord(page, start);
  const [endX, endY] = await toViewCoord(page, end);
  await dragBetweenCoords(
    page,
    { x: startX, y: startY },
    { x: endX, y: endY },
    options
  );
}

export async function toModelCoord(page: Page, point: number[]) {
  return page.evaluate(point => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.viewport.toModelCoord(point[0], point[1]);
  }, point);
}

export async function getConnectorSourceConnection(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.crud.getElementsByType('connector')[0].source;
  });
}

export async function getConnectorPath(page: Page, index = 0): Promise<IVec[]> {
  return page.evaluate(
    ([index]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      const connectors = container.service.crud.getElementsByType('connector');
      return connectors[index].absolutePath;
    },
    [index]
  );
}

export async function getConnectorPathWithInOut(
  page: Page,
  index = 0
): Promise<
  {
    point: IVec;
    in: IVec;
    out: IVec;
  }[]
> {
  return page.evaluate(
    ([index]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      const connectors = container.service.crud.getElementsByType('connector');
      return connectors[index].absolutePath.map(path => ({
        point: [path[0], path[1]],
        in: path.in,
        out: path.out,
      }));
    },
    [index]
  );
}

export async function getEdgelessElementBound(
  page: Page,
  elementId: string
): Promise<[number, number, number, number]> {
  return page.evaluate(
    ([elementId]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      const element = container.service.crud.getElementById(elementId);
      if (!element) throw new Error(`element not found: ${elementId}`);
      return JSON.parse(element.xywh);
    },
    [elementId]
  );
}

export async function getSelectedIds(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.selection.selectedElements.map(e => e.id);
  });
}

export async function getSelectedBoundCount(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.selection.selectedElements.length;
  });
}

export async function getSelectedBound(
  page: Page,
  index = 0
): Promise<[number, number, number, number]> {
  return page.evaluate(
    ([index]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      const selected = container.service.selection.selectedElements[index];
      return JSON.parse(selected.xywh);
    },
    [index]
  );
}

export async function getContainerOfElements(page: Page, ids: string[]) {
  return page.evaluate(
    ([ids]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');

      return ids.map(id => container.service.surface.getGroup(id)?.id ?? null);
    },
    [ids]
  );
}

export async function getContainerIds(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.elements.map(el => el.group?.id ?? 'null');
  });
}

export async function getContainerChildIds(page: Page, id: string) {
  return page.evaluate(
    ([id]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      const gfxModel = container.service.crud.getElementById(id);

      return gfxModel && container.service.surface.isGroup(gfxModel)
        ? gfxModel.childIds
        : [];
    },
    [id]
  );
}

export async function getCanvasElementsCount(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.elements.length;
  });
}

export async function getSortedIds(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.layer.canvasElements.map(e => e.id);
  });
}

export async function getAllSortedIds(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.edgelessElements.map(e => e.id);
  });
}

export async function getTypeById(page: Page, id: string) {
  return page.evaluate(
    ([id]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      const element = container.service.crud.getElementById(id)!;
      return 'flavour' in element ? element.flavour : element.type;
    },
    [id]
  );
}

export async function getIds(page: Page, filterGroup = false) {
  return page.evaluate(
    ([filterGroup]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      return container.service.elements
        .filter(el => !filterGroup || el.type !== 'group')
        .map(e => e.id);
    },
    [filterGroup]
  );
}

export async function getFirstContainerId(page: Page, exclude: string[] = []) {
  return page.evaluate(
    ([exclude]) => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      return (
        container.service.edgelessElements.find(
          e => container.service.surface.isGroup(e) && !exclude.includes(e.id)
        )?.id ?? ''
      );
    },
    [exclude]
  );
}

export async function getIndexes(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    return container.service.elements.map(e => e.index);
  });
}

export async function getSortedIdsInViewport(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) throw new Error('container not found');
    const { service } = container;
    return service.gfx.grid
      .search(service.viewport.viewportBounds, {
        filter: ['canvas'],
      })
      .map(e => e.id);
  });
}

export async function edgelessCommonSetup(page: Page) {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await deleteAll(page);
  await resetHistory(page);
}

export async function createFrame(
  page: Page,
  coord1: [number, number],
  coord2: [number, number]
) {
  await page.keyboard.press('f');
  await dragBetweenViewCoords(page, coord1, coord2);
  const id = (await getSelectedIds(page))[0];
  await page.keyboard.press('Escape');
  return id;
}

export async function createShapeElement(
  page: Page,
  coord1: number[],
  coord2: number[],
  shape = Shape.Square
) {
  const start = await toViewCoord(page, coord1);
  const end = await toViewCoord(page, coord2);
  const shapeId = await addBasicShapeElement(
    page,
    { x: start[0], y: start[1] },
    { x: end[0], y: end[1] },
    shape
  );
  return shapeId;
}

export async function createConnectorElement(
  page: Page,
  coord1: number[],
  coord2: number[]
) {
  const start = await toViewCoord(page, coord1);
  const end = await toViewCoord(page, coord2);
  await addBasicConnectorElement(
    page,
    { x: start[0], y: start[1] },
    { x: end[0], y: end[1] }
  );
  return (await getSelectedIds(page))[0];
}

export async function createFrameElement(
  page: Page,
  coord1: number[],
  coord2: number[]
) {
  const start = await toViewCoord(page, coord1);
  const end = await toViewCoord(page, coord2);
  await addBasicFrameElement(
    page,
    { x: start[0], y: start[1] },
    { x: end[0], y: end[1] }
  );
}

export async function createBrushElement(
  page: Page,
  coord1: number[],
  coord2: number[],
  auto = true
) {
  const start = await toViewCoord(page, coord1);
  const end = await toViewCoord(page, coord2);
  await addBasicBrushElement(
    page,
    { x: start[0], y: start[1] },
    { x: end[0], y: end[1] },
    auto
  );
}

export async function createEdgelessText(
  page: Page,
  coord: number[],
  text = 'text'
) {
  const position = await toViewCoord(page, coord);
  await addBasicEdgelessText(page, text, position[0], position[1]);
}

export async function createMindmap(page: Page, coord: number[]) {
  const position = await toViewCoord(page, coord);
  await page.keyboard.press('m');
  await page.mouse.click(position[0], position[1]);
}

export async function createNote(
  page: Page,
  coord1: number[],
  content?: string
) {
  const start = await toViewCoord(page, coord1);
  return addNote(page, content ?? 'note', start[0], start[1]);
}

export async function hoverOnNote(page: Page, id: string, offset = [0, 0]) {
  const blockRect = await page.locator(`[data-block-id="${id}"]`).boundingBox();

  if (!blockRect) {
    throw new Error('blockRect is not found');
  }

  await page.mouse.move(
    blockRect.x + blockRect.width / 2 + offset[0],
    blockRect.y + blockRect.height / 2 + offset[1]
  );
}

export function toIdCountMap(ids: string[]) {
  return ids.reduce(
    (pre, cur) => {
      pre[cur] = (pre[cur] ?? 0) + 1;
      return pre;
    },
    {} as Record<string, number>
  );
}

export function getFrameTitle(page: Page, frame: string) {
  return page.locator(`affine-frame-title[data-id="${frame}"]`);
}

export async function selectElementInEdgeless(page: Page, elements: string[]) {
  await page.evaluate(
    ({ elements }) => {
      const edgelessBlock = document.querySelector('affine-edgeless-root');
      if (!edgelessBlock) {
        throw new Error('edgeless block not found');
      }

      edgelessBlock.gfx.selection.set({
        elements,
      });
    },
    { elements }
  );
}

export async function waitFontsLoaded(page: Page) {
  await page.evaluate(() => {
    const edgelessBlock = document.querySelector('affine-edgeless-root');
    if (!edgelessBlock) {
      throw new Error('edgeless block not found');
    }

    return edgelessBlock.fontLoader?.ready;
  });
}

export function isIntersected(
  bound1: [number, number, number, number],
  bound2: [number, number, number, number]
) {
  const [x1, y1, w1, h1] = bound1;
  const [x2, y2, w2, h2] = bound2;
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}
