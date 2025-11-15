import type { EditorHost, GfxBlockComponent } from '@blocksuite/std';
import { type Viewport } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import { BlockLayoutHandlersIdentifier } from './layout/block-layout-provider';
import type {
  BlockLayout,
  BlockLayoutTreeNode,
  RenderingState,
  ViewportLayoutTree,
} from './types';

export function syncCanvasSize(canvas: HTMLCanvasElement, host: HTMLElement) {
  const hostRect = host.getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  canvas.style.position = 'absolute';
  canvas.style.left = '0px';
  canvas.style.top = '0px';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.width = hostRect.width * dpr;
  canvas.height = hostRect.height * dpr;
  canvas.style.pointerEvents = 'none';
}

export function getViewportLayoutTree(
  host: EditorHost,
  viewport: Viewport
): ViewportLayoutTree {
  const zoom = viewport.zoom;

  let layoutMinX = Infinity;
  let layoutMinY = Infinity;
  let layoutMaxX = -Infinity;
  let layoutMaxY = -Infinity;

  const store = host.std.store;
  const rootModel = store.root;

  if (!rootModel) {
    return { roots: [], overallRect: { x: 0, y: 0, w: 0, h: 0 } };
  }

  const providers = host.std.provider.getAll(BlockLayoutHandlersIdentifier);
  const providersArray = Array.from(providers.values());

  // Recursive function to build the tree structure
  const buildLayoutTreeNode = (
    model: BlockModel,
    ancestorViewportState?: string | null,
    root = false
  ): BlockLayoutTreeNode | null => {
    const baseLayout: BlockLayout = {
      blockId: model.id,
      type: model.flavour,
      rect: { x: 0, y: 0, w: 0, h: 0 },
    };

    const handler = providersArray.find(p => p.blockType === model.flavour);

    // Determine the correct viewport state to use
    const component = host.std.view.getBlock(
      model.id
    ) as GfxBlockComponent | null;
    const currentViewportState = component?.dataset.viewportState;
    const effectiveViewportState =
      currentViewportState ?? ancestorViewportState;
    const defaultViewportState = {
      left: 0,
      top: 0,
      viewportX: 0,
      viewportY: 0,
      zoom: 1,
      viewScale: 1,
    };

    const viewportRecord = effectiveViewportState
      ? viewport.deserializeRecord(effectiveViewportState) ||
        defaultViewportState
      : defaultViewportState;

    const layoutData = handler?.queryLayout(model, host, viewportRecord);
    let layout: BlockLayout = baseLayout;

    if (handler && layoutData) {
      const { rect: calculatedRect } = handler.calculateBound(layoutData);
      layout = {
        ...layoutData,
        ...baseLayout,
        rect: calculatedRect,
      };
      layoutMinX = Math.min(layoutMinX, calculatedRect.x);
      layoutMinY = Math.min(layoutMinY, calculatedRect.y);
      layoutMaxX = Math.max(layoutMaxX, calculatedRect.x + calculatedRect.w);
      layoutMaxY = Math.max(layoutMaxY, calculatedRect.y + calculatedRect.h);
    } else if (component && !root) {
      const clientRect = component.getBoundingClientRect();
      const [modelX, modelY] = viewport.toModelCoordFromClientCoord([
        clientRect.x,
        clientRect.y,
      ]);

      const rect = {
        x: modelX,
        y: modelY,
        w: clientRect.width / zoom / viewport.viewScale,
        h: clientRect.height / zoom / viewport.viewScale,
      };

      layout = {
        ...baseLayout,
        rect,
      };

      layoutMinX = Math.min(layoutMinX, rect.x);
      layoutMinY = Math.min(layoutMinY, rect.y);
      layoutMaxX = Math.max(layoutMaxX, rect.x + rect.w);
      layoutMaxY = Math.max(layoutMaxY, rect.y + rect.h);
    } else {
      layoutMinX = Math.min(layoutMinX, baseLayout.rect.x);
      layoutMinY = Math.min(layoutMinY, baseLayout.rect.y);
      layoutMaxX = Math.max(layoutMaxX, baseLayout.rect.x + baseLayout.rect.w);
      layoutMaxY = Math.max(layoutMaxY, baseLayout.rect.y + baseLayout.rect.h);
    }

    const children: BlockLayoutTreeNode[] = [];
    for (const childModel of model.children) {
      const childNode = buildLayoutTreeNode(childModel, effectiveViewportState);
      if (childNode) {
        children.push(childNode);
      }
    }

    return {
      blockId: model.id,
      type: model.flavour,
      layout,
      children,
    };
  };

  const roots: BlockLayoutTreeNode[] = [];
  const rootNode = buildLayoutTreeNode(rootModel, null, true);
  if (rootNode) {
    roots.push(rootNode);
  }

  // If no valid layouts were found, use default values
  if (layoutMinX === Infinity) {
    layoutMinX = 0;
    layoutMinY = 0;
    layoutMaxX = 0;
    layoutMaxY = 0;
  }

  // Calculate overall rectangle
  const w = (layoutMaxX - layoutMinX) / zoom / viewport.viewScale;
  const h = (layoutMaxY - layoutMinY) / zoom / viewport.viewScale;

  const result = {
    roots,
    overallRect: {
      x: layoutMinX,
      y: layoutMinY,
      w: Math.max(w, 0),
      h: Math.max(h, 0),
    },
  };

  return result;
}

export function debugLog(message: string, state: RenderingState) {
  console.log(
    `%c[ViewportTurboRenderer]%c ${message} | state=${state}`,
    'color: #4285f4; font-weight: bold;',
    'color: inherit;'
  );
}

export function paintPlaceholder(
  canvas: HTMLCanvasElement,
  layout: ViewportLayoutTree | null,
  viewport: Viewport
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !layout) return;

  const dpr = window.devicePixelRatio;
  const { overallRect } = layout;
  const layoutViewCoord = viewport.toViewCoord(overallRect.x, overallRect.y);

  const offsetX = layoutViewCoord[0];
  const offsetY = layoutViewCoord[1];
  const colors = [
    'rgba(200, 200, 200, 0.7)',
    'rgba(180, 180, 180, 0.7)',
    'rgba(160, 160, 160, 0.7)',
  ];

  const paintNode = (node: BlockLayoutTreeNode, depth: number = 0) => {
    const { layout: nodeLayout } = node;
    ctx.fillStyle = colors[depth % colors.length];
    const rect = nodeLayout.rect;
    const x = ((rect.x - overallRect.x) * viewport.zoom + offsetX) * dpr;
    const y = ((rect.y - overallRect.y) * viewport.zoom + offsetY) * dpr;
    const width = rect.w * viewport.zoom * dpr;
    const height = rect.h * viewport.zoom * dpr;

    ctx.fillRect(x, y, width, height);
    if (width > 10 && height > 5) {
      ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
      ctx.strokeRect(x, y, width, height);
    }

    if (node.children.length > 0) {
      node.children.forEach(childNode => paintNode(childNode, depth + 1));
    }
  };

  layout.roots.forEach(rootNode => paintNode(rootNode));
}
