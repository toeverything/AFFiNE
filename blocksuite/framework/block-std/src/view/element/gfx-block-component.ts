import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Bound } from '@blocksuite/global/gfx';
import { computed } from '@preact/signals-core';
import { nothing } from 'lit';

import type { BlockService } from '../../extension/index.js';
import type {
  DragMoveContext,
  GfxViewTransformInterface,
} from '../../gfx/element-transform/view-transform.js';
import { GfxControllerIdentifier } from '../../gfx/identifiers.js';
import type { GfxBlockElementModel } from '../../gfx/index.js';
import { SurfaceSelection } from '../../selection/index.js';
import { BlockComponent } from './block-component.js';

export function isGfxBlockComponent(
  element: unknown
): element is GfxBlockComponent {
  return (element as GfxBlockComponent)?.[GfxElementSymbol] === true;
}

export const GfxElementSymbol = Symbol('GfxElement');

function updateTransform(element: GfxBlockComponent) {
  if (element.dataset.blockState === 'idle') return;

  const { viewport } = element.gfx;
  element.dataset.viewportState = viewport.serializeRecord();
  element.style.transformOrigin = '0 0';
  element.style.transform = element.getCSSTransform();
}

function handleGfxConnection(instance: GfxBlockComponent) {
  instance.style.position = 'absolute';

  instance.disposables.add(
    instance.gfx.viewport.viewportUpdated.subscribe(() => {
      updateTransform(instance);
    })
  );

  instance.disposables.add(
    instance.doc.slots.blockUpdated.subscribe(({ type, id }) => {
      if (id === instance.model.id && type === 'update') {
        updateTransform(instance);
      }
    })
  );

  updateTransform(instance);
}

export abstract class GfxBlockComponent<
    Model extends GfxBlockElementModel = GfxBlockElementModel,
    Service extends BlockService = BlockService,
    WidgetName extends string = string,
  >
  extends BlockComponent<Model, Service, WidgetName>
  implements GfxViewTransformInterface
{
  [GfxElementSymbol] = true;

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    handleGfxConnection(this);
  }

  onDragMove = ({ dx, dy, currentBound }: DragMoveContext) => {
    this.model.xywh = currentBound.moveDelta(dx, dy).serialize();
  };

  onDragStart() {
    this.model.stash('xywh');
  }

  onDragEnd() {
    this.model.pop('xywh');
  }

  onRotate() {}

  onResize() {}

  getCSSTransform() {
    const viewport = this.gfx.viewport;
    const { translateX, translateY, zoom } = viewport;
    const bound = Bound.deserialize(this.model.xywh);

    const scaledX = bound.x * zoom;
    const scaledY = bound.y * zoom;
    const deltaX = scaledX - bound.x;
    const deltaY = scaledY - bound.y;

    return `translate(${translateX + deltaX}px, ${translateY + deltaY}px) scale(${zoom})`;
  }

  getRenderingRect() {
    const { xywh$ } = this.model;

    if (!xywh$) {
      throw new BlockSuiteError(
        ErrorCode.GfxBlockElementError,
        `Error on rendering '${this.model.flavour}': Gfx block's model should have 'xywh' property.`
      );
    }

    const [x, y, w, h] = JSON.parse(xywh$.value);

    return { x, y, w, h, zIndex: this.toZIndex() };
  }

  override renderBlock() {
    const { x, y, w, h, zIndex } = this.getRenderingRect();

    if (this.style.left !== `${x}px`) this.style.left = `${x}px`;
    if (this.style.top !== `${y}px`) this.style.top = `${y}px`;
    if (this.style.width !== `${w}px`) this.style.width = `${w}px`;
    if (this.style.height !== `${h}px`) this.style.height = `${h}px`;
    if (this.style.zIndex !== zIndex) this.style.zIndex = zIndex;

    return this.renderGfxBlock();
  }

  renderGfxBlock(): unknown {
    return nothing;
  }

  renderPageContent(): unknown {
    return nothing;
  }

  override async scheduleUpdate() {
    const parent = this.parentElement;

    if (this.hasUpdated || !parent || !('scheduleUpdateChildren' in parent)) {
      return super.scheduleUpdate();
    } else {
      await (parent.scheduleUpdateChildren as (id: string) => Promise<void>)(
        this.model.id
      );

      return super.scheduleUpdate();
    }
  }

  toZIndex(): string {
    return this.gfx.layer.getZIndex(this.model).toString() ?? '0';
  }

  updateZIndex(): void {
    this.style.zIndex = this.toZIndex();
  }
}

export function toGfxBlockComponent<
  Model extends GfxBlockElementModel,
  Service extends BlockService,
  WidgetName extends string,
  B extends typeof BlockComponent<Model, Service, WidgetName>,
>(CustomBlock: B) {
  // @ts-expect-error ignore
  return class extends CustomBlock {
    [GfxElementSymbol] = true;

    override selected$ = computed(() => {
      const selection = this.std.selection.value.find(
        selection => selection.blockId === this.model?.id
      );
      if (!selection) return false;
      return selection.is(SurfaceSelection);
    });

    onDragMove({ dx, dy, currentBound }: DragMoveContext) {
      this.model.xywh = currentBound.moveDelta(dx, dy).serialize();
    }

    onDragStart() {
      this.model.stash('xywh');
    }

    onDragEnd() {
      this.model.pop('xywh');
    }

    onRotate() {}

    onResize() {}

    get gfx() {
      return this.std.get(GfxControllerIdentifier);
    }

    override connectedCallback(): void {
      super.connectedCallback();
      handleGfxConnection(this);
    }

    // eslint-disable-next-line sonarjs/no-identical-functions
    getCSSTransform() {
      const viewport = this.gfx.viewport;
      const { translateX, translateY, zoom } = viewport;
      const bound = Bound.deserialize(this.model.xywh);

      const scaledX = bound.x * zoom;
      const scaledY = bound.y * zoom;
      const deltaX = scaledX - bound.x;
      const deltaY = scaledY - bound.y;

      return `translate(${translateX + deltaX}px, ${translateY + deltaY}px) scale(${zoom})`;
    }

    // eslint-disable-next-line sonarjs/no-identical-functions
    getRenderingRect(): {
      x: number;
      y: number;
      w: number | string;
      h: number | string;
      zIndex: string;
    } {
      const { xywh$ } = this.model;

      if (!xywh$) {
        throw new BlockSuiteError(
          ErrorCode.GfxBlockElementError,
          `Error on rendering '${this.model.flavour}': Gfx block's model should have 'xywh' property.`
        );
      }

      const [x, y, w, h] = JSON.parse(xywh$.value);

      return { x, y, w, h, zIndex: this.toZIndex() };
    }

    override renderBlock() {
      const { x, y, w, h, zIndex } = this.getRenderingRect();

      this.style.left = `${x}px`;
      this.style.top = `${y}px`;
      this.style.width = typeof w === 'number' ? `${w}px` : w;
      this.style.height = typeof h === 'number' ? `${h}px` : h;
      this.style.zIndex = zIndex;

      return this.renderGfxBlock();
    }

    renderGfxBlock(): unknown {
      return this.renderPageContent();
    }

    renderPageContent() {
      return super.renderBlock();
    }

    // eslint-disable-next-line sonarjs/no-identical-functions
    override async scheduleUpdate() {
      const parent = this.parentElement;

      if (this.hasUpdated || !parent || !('scheduleUpdateChildren' in parent)) {
        return super.scheduleUpdate();
      } else {
        await (parent.scheduleUpdateChildren as (id: string) => Promise<void>)(
          this.model.id
        );

        return super.scheduleUpdate();
      }
    }

    toZIndex(): string {
      return this.gfx.layer.getZIndex(this.model).toString() ?? '0';
    }

    updateZIndex(): void {
      this.style.zIndex = this.toZIndex();
    }
  } as B & {
    new (...args: any[]): GfxBlockComponent;
  };
}
