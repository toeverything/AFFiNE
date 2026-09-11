import { describe, expect, it } from 'vitest';

import { WHITEBOARD_FLAVOURS } from '../const';
import {
  paintWidgetLayout,
  type WhiteboardWidgetLayout,
  type WidgetPaintContext,
} from './painter.worker';

function createContextDouble() {
  const filled: Array<[number, number, number, number]> = [];
  const texts: string[] = [];
  const images: Array<[number, number, number, number]> = [];
  const ctx: WidgetPaintContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    fillRect: (x, y, w, h) => {
      filled.push([x, y, w, h]);
    },
    strokeRect: () => {},
    fillText: text => {
      texts.push(text);
    },
    drawImage: (_image, dx, dy, dw, dh) => {
      images.push([dx, dy, dw, dh]);
    },
  };
  return { ctx, filled, texts, images };
}

const layout: WhiteboardWidgetLayout = {
  blockId: 'chart-1',
  type: WHITEBOARD_FLAVOURS.chart,
  rect: { x: 120, y: 60, w: 480, h: 320 },
  title: 'Burndown',
  fill: '#dbeafe',
};

describe('whiteboard turbo painter', () => {
  it('draws the cached snapshot bitmap at the widget rect', () => {
    const { ctx, texts, images } = createContextDouble();
    paintWidgetLayout(
      ctx,
      { ...layout, snapshot: { width: 960, height: 640, close: () => {} } },
      100,
      50
    );
    expect(images).toEqual([[20, 10, 480, 320]]);
    expect(texts).toEqual([]);
  });

  it('falls back to a titled frame when no snapshot is decoded yet', () => {
    const { ctx, filled, texts, images } = createContextDouble();
    paintWidgetLayout(ctx, layout, 100, 50);
    expect(images).toEqual([]);
    expect(filled).toEqual([[20, 10, 480, 320]]);
    expect(texts).toEqual(['Burndown', 'chart']);
  });

  it('skips the labels when the widget is too small to read', () => {
    const { ctx, texts } = createContextDouble();
    paintWidgetLayout(
      ctx,
      { ...layout, rect: { x: 0, y: 0, w: 40, h: 20 } },
      0,
      0
    );
    expect(texts).toEqual([]);
  });
});
