import {
  Container,
  createIdentifier,
  type ServiceProvider,
} from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

import type {
  BlockLayoutPainter,
  BlockLayoutTreeNode,
  HostToWorkerMessage,
  ViewportLayoutTree,
  WorkerToHostMessage,
} from '../types';

export const BlockPainterProvider = createIdentifier<BlockLayoutPainter>(
  'block-painter-provider'
);

export const BlockLayoutPainterExtension = (
  type: string,
  painter: new () => BlockLayoutPainter
): ExtensionType => {
  return {
    setup: di => {
      di.addImpl(BlockPainterProvider(type), painter);
    },
  };
};

export class ViewportLayoutPainter {
  private readonly canvas: OffscreenCanvas = new OffscreenCanvas(0, 0);
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private zoom = 1;
  public provider: ServiceProvider;

  getPainter(type: string): BlockLayoutPainter | null {
    return this.provider.getOptional(BlockPainterProvider(type));
  }

  constructor(extensions: ExtensionType[]) {
    const container = new Container();

    extensions.forEach(extension => {
      extension.setup(container);
    });

    this.provider = container.provider();

    self.onmessage = this.handler;
  }

  setSize(layoutRectW: number, layoutRectH: number, dpr: number, zoom: number) {
    const width = layoutRectW * dpr * zoom;
    const height = layoutRectH * dpr * zoom;

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.zoom = zoom;
    this.clearBackground();
  }

  private clearBackground() {
    if (!this.canvas || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  paint(layout: ViewportLayoutTree, version: number) {
    const { canvas, ctx } = this;
    if (!canvas || !ctx) return;

    this.paintTree(layout, version);
  }

  paintTree(layout: ViewportLayoutTree, version: number) {
    const { canvas, ctx } = this;
    const { overallRect } = layout;
    if (!canvas || !ctx) return;

    this.clearBackground();
    ctx.scale(this.zoom, this.zoom);

    const paintNode = (node: BlockLayoutTreeNode) => {
      const painter = this.getPainter(node.type);
      painter?.paint(ctx, node.layout, overallRect.x, overallRect.y);
      node.children.forEach(paintNode);
    };

    layout.roots.forEach(root => paintNode(root));
    const bitmap = canvas.transferToImageBitmap();
    const message: WorkerToHostMessage = {
      type: 'bitmapPainted',
      bitmap,
      version,
    };
    self.postMessage(message, { transfer: [bitmap] });
  }

  handler = async (e: MessageEvent<HostToWorkerMessage>) => {
    const { type, data } = e.data;
    switch (type) {
      case 'paintLayout': {
        const { layout, width, height, dpr, zoom, version } = data;
        this.setSize(width, height, dpr, zoom);
        this.paint(layout, version);
        break;
      }
    }
  };
}

const meta = {
  emSize: 2048,
  hHeadAscent: 1984,
  hHeadDescent: -494,
};

export function getBaseline(fontSize: number) {
  const lineHeight = 1.2 * fontSize;

  const A = fontSize * (meta.hHeadAscent / meta.emSize); // ascent
  const D = fontSize * (meta.hHeadDescent / meta.emSize); // descent
  const AD = A + Math.abs(D); // ascent + descent
  const L = lineHeight - AD; // leading
  const y = A + L / 2;
  return y;
}
