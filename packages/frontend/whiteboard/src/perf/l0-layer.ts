import { I18n } from '@affine/i18n';
import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import { GfxExtension } from '@blocksuite/affine/std/gfx';

import { WHITEBOARD_LOD } from '../const';
import { createL0Backend, type L0Backend } from './l0-renderer';
import {
  type L0Camera,
  type L0Source,
  type L0Sprite,
  cullSprites,
  hitTestSprites,
  isL0HostFlavour,
  shouldActivateL0Layer,
  toL0Sprites,
} from './l0-scene';
import { whiteboardTelemetry } from './telemetry';

const STYLE_ID = 'wb-l0-layer-style';
const STYLE = `
.affine-edgeless-viewport.wb-l0-active [data-block-id].wb-l0-culled {
  visibility: hidden !important;
  pointer-events: none !important;
}
.affine-edgeless-viewport.wb-l0-active [data-block-id].wb-l0-live {
  visibility: visible !important;
  pointer-events: auto !important;
  position: relative;
  z-index: 3;
}
.wb-l0-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
`;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

function asSource(
  model: { id: string; xywh?: string; flavour?: string },
  selected: boolean
): L0Source | null {
  if (!model.flavour || !isL0HostFlavour(model.flavour)) return null;
  return {
    id: model.id,
    xywh: model.xywh,
    flavour: model.flavour,
    selected,
  };
}

/**
 * Presentation zoom-out layer (plan §6.5 Phase D / variant D).
 * Same Yjs store; WebGL AABB sprites replace DOM at zoom < z0.
 */
export class WhiteboardL0LayerExtension extends GfxExtension {
  static override key = 'whiteboardL0Layer';

  readonly canvas: HTMLCanvasElement = document.createElement('canvas');
  private backend: L0Backend | null = null;
  private sprites: L0Sprite[] = [];
  private active = false;
  private raf = 0;
  private mount: Element | null = null;
  private readonly unsubs: Array<() => void> = [];

  private readonly onPointerDown = (event: Event) => {
    if (!this.active || !(event instanceof PointerEvent)) return;
    const [x, y] = this.gfx.viewport.toModelCoordFromClientCoord([
      event.clientX,
      event.clientY,
    ]);
    const hit = hitTestSprites(this.sprites, x, y);
    if (!hit) return;
    event.stopPropagation();
    this.gfx.selection.set({ elements: [hit.id], editing: false });
  };

  override mounted() {
    ensureStyle();
    this.canvas.className = 'wb-l0-canvas';
    this.canvas.setAttribute(
      'aria-label',
      I18n['com.affine.whiteboard.perf.l0-label']()
    );
    this.canvas.setAttribute('role', 'img');
    this.mount =
      document.querySelector('.affine-edgeless-viewport') ?? this.std.host;
    this.mount.append(this.canvas);
    this.backend = createL0Backend(this.canvas);

    const attachPointer = (element: EventTarget) => {
      element.addEventListener('pointerdown', this.onPointerDown, true);
    };
    if (this.gfx.viewport.element) {
      attachPointer(this.gfx.viewport.element);
    }
    const ready = this.gfx.viewport.elementReady.subscribe(element => {
      attachPointer(element);
    });
    const viewport = this.gfx.viewport.viewportUpdated.subscribe(() =>
      this.scheduleRefresh()
    );
    const size = this.gfx.viewport.sizeUpdated.subscribe(() =>
      this.scheduleRefresh()
    );
    const selection = this.gfx.selection.slots.updated.subscribe(() =>
      this.scheduleRefresh()
    );
    const blocks = this.std.store.slots.blockUpdated.subscribe(() =>
      this.scheduleRefresh()
    );
    const layers = this.gfx.layer.slots.layerUpdated.subscribe(() =>
      this.scheduleRefresh()
    );
    this.unsubs.push(
      () => ready.unsubscribe(),
      () => viewport.unsubscribe(),
      () => size.unsubscribe(),
      () => selection.unsubscribe(),
      () => blocks.unsubscribe(),
      () => layers.unsubscribe()
    );
    this.refresh();
  }

  override unmounted() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.setActive(false);
    this.gfx.viewport.element?.removeEventListener(
      'pointerdown',
      this.onPointerDown,
      true
    );
    for (const unsub of this.unsubs.splice(0)) unsub();
    this.backend?.dispose();
    this.backend = null;
    this.canvas.remove();
    this.mount = null;
    whiteboardTelemetry.noteL0({ active: false, count: 0, backend: 'off' });
  }

  private scheduleRefresh() {
    if (this.raf || typeof requestAnimationFrame === 'undefined') {
      if (!this.raf) this.refresh();
      return;
    }
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.refresh();
    });
  }

  private camera(): L0Camera {
    const viewport = this.gfx.viewport;
    return {
      viewportX: viewport.viewportX,
      viewportY: viewport.viewportY,
      zoom: viewport.zoom,
      viewScale: viewport.viewScale,
      width: viewport.width || this.canvas.clientWidth || 1,
      height: viewport.height || this.canvas.clientHeight || 1,
    };
  }

  private flagEnabled() {
    try {
      const service =
        this.std.getOptional(FeatureFlagService) ??
        this.std.store.get(FeatureFlagService);
      return !!service.getFlag('enable_whiteboard_l0_layer');
    } catch {
      return true;
    }
  }

  private refresh() {
    const enabled = this.flagEnabled();
    const active = shouldActivateL0Layer(
      this.gfx.viewport.zoom,
      enabled,
      WHITEBOARD_LOD.z0
    );
    this.setActive(active);
    whiteboardTelemetry.noteBoardObjects(this.gfx.layer.blocks.length);
    if (!active || !this.backend) {
      whiteboardTelemetry.noteL0({
        active: false,
        count: 0,
        backend: this.backend?.kind ?? 'off',
      });
      return;
    }

    const selected = this.gfx.selection.selectedSet;
    const sources: L0Source[] = [];
    for (const model of this.gfx.layer.blocks) {
      const source = asSource(model, selected.has(model.id));
      if (source) sources.push(source);
    }
    const viewportBound = this.gfx.viewport.viewportBounds;
    this.sprites = cullSprites(toL0Sprites(sources), {
      x: viewportBound.x,
      y: viewportBound.y,
      w: viewportBound.w,
      h: viewportBound.h,
    });
    this.markDom();
    const camera = this.camera();
    const dpr =
      typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.backend.resize(camera.width, camera.height, dpr);
    this.backend.draw(this.sprites, camera);
    whiteboardTelemetry.noteL0({
      active: true,
      count: this.sprites.filter(sprite => !sprite.live).length,
      backend: this.backend.kind,
    });
  }

  private setActive(active: boolean) {
    this.active = active;
    this.canvas.style.display = active ? 'block' : 'none';
    this.mount?.classList.toggle('wb-l0-active', active);
    if (!active) this.clearDomMarks();
  }

  private clearDomMarks() {
    this.mount
      ?.querySelectorAll('.wb-l0-live, .wb-l0-culled')
      .forEach(node => {
        node.classList.remove('wb-l0-live', 'wb-l0-culled');
      });
  }

  private markDom() {
    this.clearDomMarks();
    for (const sprite of this.sprites) {
      const node = this.mount?.querySelector(
        `[data-block-id="${typeof CSS !== 'undefined' ? CSS.escape(sprite.id) : sprite.id}"]`
      );
      node?.classList.add(sprite.live ? 'wb-l0-live' : 'wb-l0-culled');
    }
  }
}
