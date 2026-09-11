import { WHITEBOARD_FLAVOURS, WHITEBOARD_LOD } from '../const';

export type L0Rect = { x: number; y: number; w: number; h: number };

export type L0Sprite = L0Rect & {
  id: string;
  flavour: string;
  fill: [number, number, number, number];
  live: boolean;
};

export type L0Source = {
  id: string;
  xywh?: string;
  flavour?: string;
  type?: string;
  selected?: boolean;
};

export type L0Camera = {
  viewportX: number;
  viewportY: number;
  zoom: number;
  viewScale: number;
  width: number;
  height: number;
};

export type L0Viewport = L0Rect;

const FILLS: Record<string, [number, number, number, number]> = {
  [WHITEBOARD_FLAVOURS.hello]: [0.91, 0.91, 0.92, 1],
  [WHITEBOARD_FLAVOURS.chart]: [0.58, 0.77, 0.99, 1],
  [WHITEBOARD_FLAVOURS.sketch]: [0.99, 0.83, 0.3, 1],
  [WHITEBOARD_FLAVOURS.board]: [0.53, 0.94, 0.67, 1],
  'affine:note': [0.99, 0.94, 0.54, 1],
  'affine:frame': [0.88, 0.91, 1, 1],
  'affine:image': [0.87, 0.87, 0.88, 1],
  shape: [0.81, 0.84, 0.89, 1],
};

const DEFAULT_FILL: [number, number, number, number] = [0.89, 0.89, 0.91, 1];

const SKIP_FLAVOURS = new Set(['affine:surface', 'affine:page']);

export function isL0HostFlavour(flavour: string) {
  return !SKIP_FLAVOURS.has(flavour);
}

export function shouldActivateL0Layer(
  zoom: number,
  enabled: boolean,
  z0 = WHITEBOARD_LOD.z0
) {
  return enabled && zoom < z0;
}

export function flavourFill(flavour: string) {
  return FILLS[flavour] ?? DEFAULT_FILL;
}

export function parseXywhRect(xywh?: string): L0Rect | null {
  if (!xywh) return null;
  try {
    const parsed = JSON.parse(xywh) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 4) return null;
    const [x, y, w, h] = parsed as number[];
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return { x, y, w, h };
  } catch {
    return null;
  }
}

export function toL0Sprites(sources: readonly L0Source[]): L0Sprite[] {
  const sprites: L0Sprite[] = [];
  for (const source of sources) {
    const rect = parseXywhRect(source.xywh);
    if (!rect || rect.w <= 0 || rect.h <= 0) continue;
    const flavour = source.flavour || source.type || 'shape';
    sprites.push({
      id: source.id,
      flavour,
      ...rect,
      fill: flavourFill(flavour),
      live: !!source.selected,
    });
  }
  return sprites;
}

export function intersects(a: L0Rect, b: L0Rect) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** Keep sprites that overlap the viewport (model space). */
export function cullSprites(
  sprites: readonly L0Sprite[],
  viewport: L0Viewport
) {
  return sprites.filter(sprite => intersects(sprite, viewport));
}

/** Top-most sprite under a model-space point. Live sprites stay in DOM. */
export function hitTestSprites(
  sprites: readonly L0Sprite[],
  x: number,
  y: number
) {
  for (let i = sprites.length - 1; i >= 0; i--) {
    const sprite = sprites[i];
    if (
      sprite &&
      !sprite.live &&
      x >= sprite.x &&
      y >= sprite.y &&
      x <= sprite.x + sprite.w &&
      y <= sprite.y + sprite.h
    ) {
      return sprite;
    }
  }
  return;
}

export function spriteToView(sprite: L0Sprite, camera: L0Camera): L0Rect {
  const scale = camera.zoom * camera.viewScale;
  return {
    x: (sprite.x - camera.viewportX) * scale,
    y: (sprite.y - camera.viewportY) * scale,
    w: sprite.w * scale,
    h: sprite.h * scale,
  };
}

export function l0DrawableSprites(sprites: readonly L0Sprite[]) {
  return sprites.filter(sprite => !sprite.live);
}
