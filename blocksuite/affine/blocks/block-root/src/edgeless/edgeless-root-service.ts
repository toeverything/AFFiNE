import { EdgelessFrameManagerIdentifier } from '@blocksuite/affine-block-frame';
import {
  EdgelessCRUDIdentifier,
  EdgelessLegacySlotIdentifier,
  type ElementRenderer,
  elementRenderers,
  getSurfaceBlock,
  type SurfaceBlockModel,
  type SurfaceContext,
} from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  RootBlockSchema,
} from '@blocksuite/affine-model';
import type { BlockStdScope } from '@blocksuite/block-std';
import type {
  GfxController,
  GfxModel,
  LayerManager,
  PointTestOptions,
  ReorderingDirection,
} from '@blocksuite/block-std/gfx';
import {
  GfxBlockElementModel,
  GfxControllerIdentifier,
  isGfxGroupCompatibleModel,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '@blocksuite/block-std/gfx';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Bound, getCommonBound } from '@blocksuite/global/gfx';
import { effect } from '@preact/signals-core';
import clamp from 'lodash-es/clamp';

import { RootService } from '../root-service.js';
import { TemplateJob } from './services/template.js';
import {
  createInsertPlaceMiddleware,
  createRegenerateIndexMiddleware,
  createStickerMiddleware,
  replaceIdMiddleware,
} from './services/template-middlewares.js';
import { getCursorMode } from './utils/query.js';

export class EdgelessRootService extends RootService implements SurfaceContext {
  static override readonly flavour = RootBlockSchema.model.flavour;

  private readonly _surface: SurfaceBlockModel;

  elementRenderers: Record<string, ElementRenderer> = elementRenderers;

  TemplateJob = TemplateJob;

  get blocks(): GfxBlockElementModel[] {
    return this.layer.blocks;
  }

  /**
   * sorted edgeless elements
   */
  get edgelessElements(): GfxModel[] {
    return [...this.layer.canvasElements, ...this.layer.blocks].sort(
      this.layer.compare
    );
  }

  /**
   * sorted canvas elements
   */
  get elements() {
    return this.layer.canvasElements;
  }

  get frame() {
    return this.std.get(EdgelessFrameManagerIdentifier);
  }

  /**
   * Get all sorted frames by presentation orderer,
   * the legacy frame that uses `index` as presentation order
   * will be put at the beginning of the array.
   */
  get frames() {
    return this.frame.frames;
  }

  get gfx(): GfxController {
    return this.std.get(GfxControllerIdentifier);
  }

  override get host() {
    return this.std.host;
  }

  get layer(): LayerManager {
    return this.gfx.layer;
  }

  get locked() {
    return this.viewport.locked;
  }

  set locked(locked: boolean) {
    this.viewport.locked = locked;
  }

  get selection() {
    return this.gfx.selection;
  }

  get surface() {
    return this._surface;
  }

  get viewport() {
    return this.std.get(GfxControllerIdentifier).viewport;
  }

  get zoom() {
    return this.viewport.zoom;
  }

  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  constructor(std: BlockStdScope, flavourProvider: { flavour: string }) {
    super(std, flavourProvider);
    const surface = getSurfaceBlock(this.doc);
    if (!surface) {
      throw new BlockSuiteError(
        ErrorCode.NoSurfaceModelError,
        'This doc is missing surface block in edgeless.'
      );
    }
    this._surface = surface;
  }

  private _initReadonlyListener() {
    const doc = this.doc;

    const slots = this.std.get(EdgelessLegacySlotIdentifier);

    let readonly = doc.readonly;
    this.disposables.add(
      effect(() => {
        if (readonly !== doc.readonly) {
          readonly = doc.readonly;
          slots.readonlyUpdated.next(readonly);
        }
      })
    );
  }

  private _initSlotEffects() {
    const { disposables } = this;

    disposables.add(
      effect(() => {
        const value = this.gfx.tool.currentToolOption$.value;
        this.gfx.cursor$.value = getCursorMode(value);
      })
    );
  }

  createTemplateJob(
    type: 'template' | 'sticker',
    center?: { x: number; y: number }
  ) {
    const middlewares: ((job: TemplateJob) => void)[] = [];

    if (type === 'template') {
      const bounds = [...this.blocks, ...this.elements].map(i =>
        Bound.deserialize(i.xywh)
      );
      const currentContentBound = getCommonBound(bounds);

      if (currentContentBound) {
        currentContentBound.x +=
          currentContentBound.w + 20 / this.viewport.zoom;
        middlewares.push(createInsertPlaceMiddleware(currentContentBound));
      }

      const idxGenerator = this.layer.createIndexGenerator();

      middlewares.push(createRegenerateIndexMiddleware(() => idxGenerator()));
    }

    if (type === 'sticker') {
      middlewares.push(
        createStickerMiddleware(center || this.viewport.center, () =>
          this.layer.generateIndex()
        )
      );
    }

    middlewares.push(replaceIdMiddleware);

    return TemplateJob.create({
      model: this.surface,
      type,
      middlewares,
    });
  }

  generateIndex() {
    return this.layer.generateIndex();
  }

  getConnectors(element: GfxModel | string) {
    const id = typeof element === 'string' ? element : element.id;

    return this.surface.getConnectors(id) as ConnectorElementModel[];
  }

  override mounted() {
    super.mounted();
    this._initSlotEffects();
    this._initReadonlyListener();
  }

  /**
   * This method is used to pick element in group, if the picked element is in a
   * group, we will pick the group instead. If that picked group is currently selected, then
   * we will pick the element itself.
   */
  pickElementInGroup(
    x: number,
    y: number,
    options?: PointTestOptions
  ): GfxModel | null {
    return this.gfx.getElementInGroup(x, y, options);
  }

  removeElement(id: string | GfxModel) {
    id = typeof id === 'string' ? id : id.id;

    const el = this.crud.getElementById(id);
    if (isGfxGroupCompatibleModel(el)) {
      el.childIds.forEach(childId => {
        this.removeElement(childId);
      });
    }

    if (el instanceof GfxBlockElementModel) {
      this.doc.deleteBlock(el);
      return;
    }

    if (this._surface.hasElementById(id)) {
      this._surface.deleteElement(id);
      return;
    }
  }

  reorderElement(element: GfxModel, direction: ReorderingDirection) {
    const index = this.layer.getReorderedIndex(element, direction);

    // block should be updated in transaction
    if (element instanceof GfxBlockElementModel) {
      this.doc.transact(() => {
        element.index = index;
      });
    } else {
      element.index = index;
    }
  }

  setZoomByAction(action: 'fit' | 'out' | 'reset' | 'in') {
    if (this.locked) return;

    switch (action) {
      case 'fit':
        this.gfx.fitToScreen();
        break;
      case 'reset':
        this.viewport.smoothZoom(1.0);
        break;
      case 'in':
      case 'out':
        this.setZoomByStep(ZOOM_STEP * (action === 'in' ? 1 : -1));
    }
  }

  setZoomByStep(step: number) {
    this.viewport.smoothZoom(clamp(this.zoom + step, ZOOM_MIN, ZOOM_MAX));
  }

  override unmounted() {
    super.unmounted();

    this.viewport?.dispose();
    this.selectionManager.set([]);
    this.disposables.dispose();
  }
}
