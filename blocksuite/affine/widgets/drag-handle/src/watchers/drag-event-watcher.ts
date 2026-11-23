import {
  EMBED_IFRAME_DEFAULT_HEIGHT_IN_SURFACE,
  EMBED_IFRAME_DEFAULT_WIDTH_IN_SURFACE,
} from '@blocksuite/affine-block-embed';
import { ParagraphBlockComponent } from '@blocksuite/affine-block-paragraph';
import { DropIndicator } from '@blocksuite/affine-components/drop-indicator';
import {
  AttachmentBlockModel,
  BookmarkBlockModel,
  DatabaseBlockModel,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  type EmbedCardStyle,
  ListBlockModel,
  NoteBlockModel,
  RootBlockModel,
} from '@blocksuite/affine-model';
import { surfaceRefToEmbed } from '@blocksuite/affine-shared/adapters';
import {
  BLOCK_CHILDREN_CONTAINER_PADDING_LEFT,
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  DndApiExtensionIdentifier,
  DocModeProvider,
  EmbedIframeService,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  captureEventTarget,
  type DropTarget as DropResult,
  findNoteBlockModel,
  getBlockComponentsExcludeSubtrees,
  getRectByBlockComponent,
  getScrollContainer,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import {
  Bound,
  type IVec,
  Point,
  Rect,
  type SerializedXYWH,
} from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import {
  BlockComponent,
  type BlockStdScope,
  type DragFromBlockSuite,
  type DragPayload,
  type DropPayload,
} from '@blocksuite/std';
import {
  GfxBlockElementModel,
  GfxControllerIdentifier,
  GfxGroupLikeElementModel,
  type GfxModel,
  GfxPrimitiveElementModel,
  isGfxGroupCompatibleModel,
  isPrimitiveModel,
  SURFACE_YMAP_UNIQ_IDENTIFIER,
  SurfaceBlockModel,
} from '@blocksuite/std/gfx';
import {
  type BlockModel,
  type BlockSnapshot,
  internalPrimitives,
  Slice,
  type SliceSnapshot,
  toDraftModel,
} from '@blocksuite/store';
import groupBy from 'lodash-es/groupBy';
import last from 'lodash-es/last';

import type { AffineDragHandleWidget } from '../drag-handle.js';
import { PreviewHelper } from '../helpers/preview-helper.js';
import { gfxBlocksFilter } from '../middleware/blocks-filter.js';
import { cardStyleUpdater } from '../middleware/card-style-updater.js';
import { newIdCrossDoc } from '../middleware/new-id-cross-doc.js';
import { reorderList } from '../middleware/reorder-list';
import {
  containBlock,
  extractIdsFromSnapshot,
  getParentNoteBlock,
  getSnapshotRect,
  includeTextSelection,
  isOutOfNoteBlock,
} from '../utils.js';

export type DragBlockEntity = {
  type: 'blocks';
  /**
   * The mode that the blocks are dragged from
   */
  fromMode?: 'block' | 'gfx';
  snapshot?: SliceSnapshot;
  modelIds: string[];
};

export type DragBlockPayload = DragPayload<DragBlockEntity, DragFromBlockSuite>;

declare module '@blocksuite/std' {
  interface DNDEntity {
    blocks: DragBlockPayload;
  }
}
export class DragEventWatcher {
  dropIndicator: null | DropIndicator = null;

  previewHelper = new PreviewHelper(this.widget);

  dropTargetCleanUps: Map<string, (() => void)[]> = new Map();

  resetOpacityCallbacks: (() => void)[] = [];

  get host() {
    return this.widget.host;
  }

  get mode() {
    return this.widget.mode;
  }

  get std() {
    return this.widget.std;
  }

  get gfx() {
    return this.widget.std.get(GfxControllerIdentifier);
  }

  private readonly _createDropIndicator = () => {
    let topElement: HTMLElement = this.widget;
    const body = this.widget.ownerDocument.body;

    while (topElement && topElement.parentElement !== body) {
      topElement = topElement.parentElement!;
    }
    const zIndex = topElement
      ? (parseInt(window.getComputedStyle(topElement).zIndex) || 1) + 1
      : 2;

    if (!this.dropIndicator) {
      this.dropIndicator = new DropIndicator();
      this.dropIndicator.zIndex = zIndex;
      this.widget.ownerDocument.body.append(this.dropIndicator);
    }
  };

  private readonly _clearDropIndicator = () => {
    if (this.dropIndicator) {
      this.dropIndicator.remove();
      this.dropIndicator = null;
    }
  };

  private readonly _cleanup = () => {
    this._clearDropIndicator();
    this.widget.hide(true);
    this.std.selection.setGroup('gfx', []);
    this.resetOpacityCallbacks.forEach(callback => callback());
  };

  private readonly _onDragMove = (
    point: Point,
    payload: DragBlockPayload,
    dropPayload: DropPayload,
    block: BlockComponent
  ) => {
    this._createDropIndicator();
    this._updateDropIndicator(point, payload, dropPayload, block);
  };

  private readonly _getFallbackInsertPlace = (block: BlockModel) => {
    const store = this.std.store;
    let curBlock: BlockModel | null = block;

    while (curBlock) {
      const parent = store.getParent(curBlock);

      if (parent && matchModels(parent, [NoteBlockModel])) {
        return curBlock;
      }

      curBlock = parent;
    }

    return null;
  };

  /**
   * When dragging, should update indicator position and target drop block id
   */
  private readonly _getDropResult = (
    dropBlock: BlockComponent,
    dragPayload: DragBlockPayload,
    dropPayload: DropPayload
  ): DropResult | null => {
    const dropModel = dropBlock.model;

    const snapshot = dragPayload?.bsEntity?.snapshot;
    if (
      !snapshot ||
      snapshot.content.length === 0 ||
      !dragPayload?.from ||
      matchModels(dropModel, [DatabaseBlockModel])
    )
      return null;

    const isDropOnNoteBlock = matchModels(dropModel, [NoteBlockModel]);

    const schema = this.std.store.schema;
    const edge = dropPayload.edge;
    const scale = this.widget.scale.peek();
    let result: DropResult | null = null;

    if (edge === 'right' && matchModels(dropModel, [ListBlockModel])) {
      const domRect = getRectByBlockComponent(dropBlock);
      const placement = 'in';

      if (
        snapshot.content.every(block =>
          schema.safeValidate(block.flavour, 'affine:list')
        )
      ) {
        const rect = Rect.fromLWTH(
          domRect.left + BLOCK_CHILDREN_CONTAINER_PADDING_LEFT,
          domRect.width - BLOCK_CHILDREN_CONTAINER_PADDING_LEFT,
          domRect.top + domRect.height,
          3 * scale
        );

        result = {
          placement,
          rect,
          modelState: {
            model: dropBlock.model,
            rect: domRect,
            element: dropBlock,
          },
        };
      } else {
        const fallbackModel = this._getFallbackInsertPlace(dropBlock.model);

        if (fallbackModel) {
          const fallbackModelView = this.std.view.getBlock(fallbackModel.id)!;
          const domRect = fallbackModelView?.getBoundingClientRect();

          result = {
            placement: 'after',
            rect: Rect.fromLWTH(
              domRect.left,
              domRect.width,
              domRect.top + domRect.height,
              3 * scale
            ),
            modelState: {
              model: fallbackModel,
              rect: domRect,
              element: fallbackModelView,
            },
          };
        }
      }
    } else {
      const placement =
        isDropOnNoteBlock &&
        schema.safeValidate(snapshot.content[0].flavour, 'affine:note')
          ? 'in'
          : edge === 'top'
            ? 'before'
            : 'after';
      const domRect = getRectByBlockComponent(dropBlock);
      const y =
        placement === 'after'
          ? domRect.top + domRect.height
          : domRect.top - 3 * scale;

      result = {
        placement,
        rect: Rect.fromLWTH(domRect.left, domRect.width, y, 3 * scale),
        modelState: {
          model: dropModel,
          rect: domRect,
          element: dropBlock,
        },
      };
    }

    return result;
  };

  private readonly _updateDropIndicator = (
    point: Point,
    dragPayload: DragBlockPayload,
    dropPayload: DropPayload,
    dropBlock: BlockComponent
  ) => {
    const closestNoteBlock = dropBlock && getParentNoteBlock(dropBlock);

    if (
      !closestNoteBlock ||
      isOutOfNoteBlock(
        this.host,
        closestNoteBlock,
        point,
        this.widget.scale.peek()
      )
    ) {
      this._resetDropResult();
    } else {
      const dropResult = this._getDropResult(
        dropBlock,
        dragPayload,
        dropPayload
      );
      this._updateDropResult(dropResult);
    }
  };

  private readonly _resetDropResult = () => {
    if (this.dropIndicator) this.dropIndicator.rect = null;
  };

  private readonly _updateDropResult = (dropResult: DropResult | null) => {
    if (!this.dropIndicator) return;

    if (dropResult?.rect) {
      const { left, top, width, height } = dropResult.rect;
      const rect = Rect.fromLWTH(left, width, top, height);

      this.dropIndicator.rect = rect;
    } else {
      this.dropIndicator.rect = dropResult?.rect ?? null;
    }
  };

  private readonly _getSnapshotFromSelectedGfxElms = () => {
    const selectedElmId = this.widget.anchorBlockId.peek()!;
    const selectedElm = this.gfx.getElementById(selectedElmId);

    if (!selectedElm) {
      return {
        snapshot: undefined,
      };
    }

    const getElementsInContainer = (
      elem: GfxModel,
      selectedElements: string[] = []
    ) => {
      selectedElements.push(elem.id);

      if (isGfxGroupCompatibleModel(elem)) {
        elem.childElements.forEach(child => {
          getElementsInContainer(child, selectedElements);
        });
      }

      return selectedElements;
    };
    const toSnapshotRequiredBlocks = (selectedModels: string[]) => {
      let surfaceAdded = false;
      const blocks: BlockModel[] = [];
      const blocksUnderSurface: BlockModel[] = [];

      selectedModels.forEach(id => {
        const model = this.gfx.getElementById(id);

        if (!model) {
          return;
        }

        if (model instanceof GfxPrimitiveElementModel) {
          if (surfaceAdded) return;
          surfaceAdded = true;
          blocks.push(this.gfx.surface!);
        } else {
          const parentModel = this.std.store.getParent(model);

          if (matchModels(parentModel, [SurfaceBlockModel])) {
            blocksUnderSurface.push(model);
          } else {
            blocks.push(model);
          }
        }
      });

      if (surfaceAdded) {
        // surface children are included, so no need to add the blocksUnderSurface
        return blocks;
      } else {
        return blocks.concat(blocksUnderSurface);
      }
    };

    const selectedElements = getElementsInContainer(
      selectedElm as GfxModel,
      []
    );
    const blocksOfSnapshot = toSnapshotRequiredBlocks(selectedElements);

    return {
      snapshot: this._toSnapshot(blocksOfSnapshot, [selectedElmId]),
    };
  };

  private readonly _getDraggedSnapshot = () => {
    const { snapshot } =
      this.widget.activeDragHandle === 'block'
        ? this._getSnapshotFromHoveredBlocks()
        : this._getSnapshotFromSelectedGfxElms();

    return {
      fromMode: this.widget.activeDragHandle!,
      snapshot,
    };
  };

  private readonly _getSnapshotFromHoveredBlocks = () => {
    const hoverBlock = this.widget.anchorBlockComponent.peek()!;

    let selections = this.widget.selectionHelper.selectedBlocks;

    // When current selection is TextSelection
    // Should set BlockSelection for the blocks in native range
    if (selections.length > 0 && includeTextSelection(selections)) {
      const nativeSelection = document.getSelection();
      const rangeManager = this.std.range;

      if (nativeSelection && nativeSelection.rangeCount > 0 && rangeManager) {
        const range = nativeSelection.getRangeAt(0);
        const blocks = rangeManager.getSelectedBlockComponentsByRange(range, {
          match: el => el.model.role === 'content',
          mode: 'highest',
        });
        this.widget.selectionHelper.setSelectedBlocks(blocks);
        selections = this.widget.selectionHelper.selectedBlocks;
      }
    }

    // When there is no selected blocks
    // Or selected blocks not including current hover block
    // Set current hover block as selected
    if (
      selections.length === 0 ||
      !containBlock(
        selections.map(selection => selection.blockId),
        this.widget.anchorBlockId.peek()!
      )
    ) {
      this.widget.selectionHelper.setSelectedBlocks([hoverBlock]);
    }

    const collapsedBlock: BlockComponent[] = [];
    const blocks = this.widget.selectionHelper.selectedBlockComponents.flatMap(
      block => {
        // filter out collapsed siblings
        if (collapsedBlock.includes(block)) return [];

        // if block is toggled heading, should select all siblings
        if (
          block instanceof ParagraphBlockComponent &&
          block.model.props.type.startsWith('h') &&
          block.model.props.collapsed
        ) {
          const collapsedSiblings = block.collapsedSiblings.flatMap(
            sibling => this.widget.host.view.getBlock(sibling.id) ?? []
          );
          collapsedBlock.push(...collapsedSiblings);
          return [block, ...collapsedSiblings];
        }
        return [block];
      }
    );

    // This could be skipped if we can ensure that all selected blocks are on the same level
    // Which means not selecting parent block and child block at the same time
    const blocksExcludingChildren = getBlockComponentsExcludeSubtrees(
      blocks
    ) as BlockComponent[];

    return {
      snapshot: this._toSnapshot(blocksExcludingChildren),
    };
  };

  private readonly _onEdgelessDrop = (
    dropBlock: BlockComponent,
    dragPayload: DragBlockPayload,
    dropPayload: DropPayload,
    point: Point
  ) => {
    /**
     * When drag gfx elements from edgeless editor to other editor, there's some limitation:
     * - when drop on the place other than note block, edgeless content can't be drag and drop within the same doc
     * - when drop on note block, handle the drop data in the same way as it in page editor,
     *   and it will filter out the block that can't be placed under note block
     * - drop data will be wrapped in a note block if it can't be placed under surface block or root block
     */
    if (matchModels(dropBlock.model, [RootBlockModel])) {
      // can't drop edgeless content on the same doc
      if (
        dragPayload.bsEntity?.fromMode === 'gfx' &&
        dragPayload.from?.docId === this.widget.store.id
      ) {
        return;
      }

      const surfaceBlockModel = this.gfx.surface;
      const snapshot = dragPayload?.bsEntity?.snapshot;

      if (!snapshot || !surfaceBlockModel) {
        return;
      }

      if (dragPayload.bsEntity?.fromMode === 'gfx') {
        this._mergeSnapshotToCurDoc(snapshot, point).catch(console.error);
      } else {
        this._dropAsGfxBlock(snapshot, point);
        this.widget.selectionHelper.selection.clear(['block']);
      }
    } else {
      this._onPageDrop(dropBlock, dragPayload, dropPayload, point);
    }
  };

  private readonly _onPageDrop = (
    dropBlock: BlockComponent,
    dragPayload: DragBlockPayload,
    dropPayload: DropPayload,
    _: Point
  ) => {
    const result = this._getDropResult(dropBlock, dragPayload, dropPayload);
    const snapshot = dragPayload?.bsEntity?.snapshot;

    if (!result || !snapshot || snapshot.content.length === 0) return;

    const store = this.std.store;
    const schema = store.schema;
    const model = result.modelState.model;
    const parent =
      result.placement === 'in' ? model : this.std.store.getParent(model)!;
    const index =
      result.placement === 'in'
        ? 0
        : parent.children.indexOf(model) +
          (result.placement === 'before' ? 0 : 1);

    if (!parent) return;

    // drop on the same place, do nothing
    if (
      (dragPayload.from?.docId === this.widget.store.id &&
        result.placement === 'after' &&
        parent.children[index]?.id === snapshot.content[0].id) ||
      (result.placement === 'before' &&
        parent.children[index - 1]?.id === last(snapshot.content)!.id)
    ) {
      return;
    }

    // drop a note on other note
    if (
      matchModels(parent, [NoteBlockModel]) &&
      snapshot.content.every(block => block.flavour === 'affine:note')
    ) {
      snapshot.content = snapshot.content.filter(
        block =>
          dragPayload.from?.docId !== this.widget.store.id ||
          block.id !== parent.id
      );
      if (snapshot.content.length) {
        this._onDropNoteOnNote(snapshot, parent.id, index);
      }
      return;
    }

    // all blocks can be safely dropped in the target parent
    if (
      snapshot.content.every(block =>
        schema.safeValidate(block.flavour, parent.flavour)
      )
    ) {
      this._dropToModel(snapshot, parent.id, index).catch(console.error);
      return;
    }

    if (
      dragPayload.bsEntity?.fromMode === 'gfx' &&
      matchModels(parent, [NoteBlockModel])
    ) {
      // if the snapshot comes from the same doc, just create a surface-ref block
      if (dragPayload.from?.docId === this.widget.store.id) {
        let largestElem!: {
          size: number;
          id: string;
          flavour: string;
        };

        const walk = (block: BlockSnapshot) => {
          if (block.flavour === 'affine:surface') {
            Object.values(
              block.props.elements as Record<
                string,
                { id: string; xywh: SerializedXYWH; type: string }
              >
            ).forEach(elem => {
              if (elem.xywh) {
                const bound = Bound.deserialize(elem.xywh);
                const size = bound.w * bound.h;
                if ((largestElem?.size ?? 0) < size) {
                  largestElem = { size, id: elem.id, flavour: elem.type };
                }
              }
            });
            block.children.forEach(walk);
          } else {
            if (block.props.xywh) {
              const bound = Bound.deserialize(
                block.props.xywh as SerializedXYWH
              );
              const size = bound.w * bound.h;
              if ((largestElem?.size ?? 0) < size) {
                largestElem = { size, id: block.id, flavour: block.flavour };
              }
            }
          }
        };

        snapshot.content.forEach(walk);

        if (largestElem) {
          store.addBlock(
            'affine:surface-ref',
            {
              reference: largestElem.id,
              refFlavour: largestElem.flavour,
            },
            parent.id,
            index
          );
        } else {
          store.addBlock(
            'affine:embed-linked-doc',
            {
              pageId: store.doc.id,
            },
            parent.id,
            index
          );
        }
      }
      // otherwise, merge the snapshot into the current doc
      // and create a surface-ref block or embed-linked-doc block
      else {
        this._mergeSnapshotToCurDoc(snapshot)
          .then(idRemap => {
            let largestElem!: {
              size: number;
              id: string;
              flavour: string;
            };

            idRemap.forEach(val => {
              const gfxElement = this.gfx.getElementById(val) as GfxModel;

              if (gfxElement?.elementBound) {
                const elemBound = gfxElement.elementBound;
                const flavour = isPrimitiveModel(gfxElement)
                  ? gfxElement.type
                  : gfxElement.flavour;

                largestElem =
                  (largestElem?.size ?? 0) < elemBound.w * elemBound.h
                    ? { size: elemBound.w * elemBound.h, id: val, flavour }
                    : largestElem;
              }
            });

            if (!largestElem) {
              store.addBlock(
                'affine:embed-linked-doc',
                {
                  pageId: store.doc.id,
                },
                parent.id,
                index
              );
            } else {
              store.addBlock(
                'affine:surface-ref',
                {
                  reference: largestElem.id,
                  refFlavour: largestElem.flavour,
                },
                parent.id,
                index
              );
            }
          })
          .catch(console.error);
      }
    }
  };

  private readonly _onDrop = (
    dropBlock: BlockComponent,
    dragPayload: DragBlockPayload,
    dropPayload: DropPayload,
    point: Point
  ) => {
    this.std.store.captureSync();
    if (this.mode === 'edgeless') {
      this._onEdgelessDrop(dropBlock, dragPayload, dropPayload, point);
    } else {
      this._onPageDrop(dropBlock, dragPayload, dropPayload, point);
    }
  };

  private readonly _onDropNoteOnNote = (
    snapshot: SliceSnapshot,
    parent?: string,
    index?: number
  ) => {
    const [first] = snapshot.content;
    const id = first.id;

    const std = this.std;
    const job = this._getJob();
    const snapshotWithoutNote = {
      ...snapshot,
      content: first.children,
    };
    job
      .snapshotToSlice(snapshotWithoutNote, std.store, parent, index)
      .then(() => {
        const block = std.store.getBlock(id)?.model;
        if (block) {
          std.store.deleteBlock(block);
        }
      })
      .catch(console.error);
  };

  /**
   * Merge the snapshot into the current existing surface model and page model.
   * This method does the following:
   * 1. Analyze the snapshot to build the container dependency tree
   * 2. Merge the snapshot in the correct order to make sure all containers are created after their children
   * @param snapshot
   * @param point
   */
  private readonly _mergeSnapshotToCurDoc = async (
    snapshot: SliceSnapshot,
    point?: Point
  ) => {
    if (!point) {
      const bound = this.gfx.elementsBound;
      point = new Point(bound.x + bound.w, bound.y + bound.h / 2);
    } else {
      point = Point.from(
        this.gfx.viewport.toModelCoordFromClientCoord([point.x, point.y])
      );
    }

    this._rewriteSnapshotXYWH(snapshot, point);

    const surface = this.gfx.surface!;
    const root = this.std.store.root!;
    const schema = this.std.store.schema;
    const containerTree: Record<string, Set<string>> = { root: new Set() };
    const idRemap = new Map<string, string>();
    let elemMap: Record<
      string,
      {
        type: string;
        xywh?: SerializedXYWH;
        children?: { json: Record<string, unknown> };
      }
    > = {};
    const blockMap: Record<
      string,
      {
        surfaceChild: boolean;
        snapshot: BlockSnapshot;
      }
    > = {};

    const isGroupLikeElem = (elem: { type: string }) => {
      const constructor = surface.getConstructor(elem.type);
      const isGroup = Object.isPrototypeOf.call(
        GfxGroupLikeElementModel.prototype,
        constructor.prototype
      );

      return isGroup;
    };
    const isGroupLikeBlock = (flavour: string) => {
      const blockModel = schema.get(flavour)?.model.toModel?.();

      return blockModel && isGfxGroupCompatibleModel(blockModel);
    };

    // walk through the snapshot to build the container dependency tree
    const buildContainerTree = (block: BlockSnapshot) => {
      if (block.flavour === 'affine:surface') {
        elemMap = (block.props.elements as typeof elemMap) ?? {};
        Object.entries(elemMap).forEach(([elemId, elem]) => {
          if (
            Object.values(containerTree).every(
              childSet => !childSet.has(elemId)
            )
          ) {
            containerTree['root'].add(elemId);
          }

          if (isGroupLikeElem(elem)) {
            Object.keys(elem.children?.json ?? {}).forEach(childId => {
              containerTree[elemId] = containerTree[elemId] ?? new Set();
              containerTree[elemId].add(childId);
              // if the child was already added to the root, remove it
              containerTree['root'].delete(childId);
            });
            return;
          } else if (elem.type === 'connector') {
            assertType<{
              type: 'connector';
              source: { position: IVec; id?: string };
              target: { position: IVec; id?: string };
            }>(elem);

            if (elem.source.id) {
              containerTree[elemId] = containerTree[elemId] ?? new Set();
              containerTree[elemId].add(elem.source.id);
              containerTree['root'].delete(elem.source.id);
            }

            if (elem.target.id) {
              containerTree[elemId] = containerTree[elemId] ?? new Set();
              containerTree[elemId].add(elem.target.id);
              containerTree['root'].delete(elem.target.id);
            }
          }
        });

        block.children?.forEach(buildContainerTree);
      } else {
        const isSurfaceChild = schema.safeValidate(
          block.flavour,
          'affine:surface'
        );
        blockMap[block.id] = {
          surfaceChild: isSurfaceChild,
          snapshot: block,
        };

        if (
          Object.values(containerTree).every(
            childSet => !childSet.has(block.id)
          )
        ) {
          containerTree['root'].add(block.id);
        }

        if (isGroupLikeBlock(block.flavour)) {
          Object.keys(block.props.childElementIds ?? {}).forEach(childId => {
            containerTree[block.id] = containerTree[block.id] ?? new Set();
            containerTree[block.id].add(childId);
            // if the child was already added to the root, remove it
            containerTree['root'].delete(childId);
          });
        }
      }
    };

    snapshot.content.forEach(buildContainerTree);

    const addInDependencyOrder = async (id: string) => {
      if (containerTree[id]) {
        for (const childId of containerTree[id]) {
          await addInDependencyOrder(childId);
        }
      }

      if (blockMap[id]) {
        const { surfaceChild, snapshot: blockSnapshot } = blockMap[id];

        if (isGroupLikeBlock(blockSnapshot.flavour)) {
          Object.keys(blockSnapshot.props.childElementIds ?? {}).forEach(
            childId => {
              assertType<Record<string, unknown>>(
                blockSnapshot.props.childElementIds
              );

              if (idRemap.has(childId)) {
                const remappedId = idRemap.get(childId)!;
                blockSnapshot.props.childElementIds[remappedId] =
                  blockSnapshot.props.childElementIds[childId];
                delete blockSnapshot.props.childElementIds[childId];
              } else {
                delete blockSnapshot.props.childElementIds[childId];
              }
            }
          );
        }

        const slices = await this._dropToModel(
          {
            ...snapshot,
            content: [blockSnapshot],
          },
          surfaceChild ? surface.id : root.id
        );

        if (slices) {
          idRemap.set(id, slices.content[0].id);
        }
      } else if (elemMap[id]) {
        const elem = elemMap[id];

        Object.entries(elem).forEach(([_, val]) => {
          if (
            val instanceof Object &&
            Reflect.has(val, SURFACE_YMAP_UNIQ_IDENTIFIER)
          ) {
            const childJson = Reflect.get(val, 'json') as Record<
              string,
              unknown
            >;

            Object.keys(childJson).forEach(oldChildId => {
              if (idRemap.has(oldChildId)) {
                const remappedId = idRemap.get(oldChildId)!;
                const val = structuredClone(childJson[oldChildId]);

                if (elem.type === 'mindmap') {
                  assertType<{ parent?: string }>(val);
                  if (val.parent) {
                    val.parent = idRemap.get(val.parent);
                  }
                }
                childJson[remappedId] = val;
                delete childJson[oldChildId];
              } else {
                delete childJson[oldChildId];
              }
            });
          }
        });

        if (elem.type === 'connector') {
          assertType<{
            type: 'connector';
            source: { position: IVec; id?: string };
            target: { position: IVec; id?: string };
          }>(elem);

          (['source', 'target'] as const).forEach(key => {
            const endpoint = elem[key];
            if (endpoint.id) {
              if (idRemap.get(endpoint.id)) {
                endpoint.id = idRemap.get(endpoint.id);
              } else {
                delete endpoint.id;
              }
            }
          });
        }

        const newId = surface.addElement(elem);
        idRemap.set(id, newId);
      }
    };

    for (const id of containerTree['root']) {
      await addInDependencyOrder(id);
    }

    return idRemap;
  };

  /**
   * Rewrite the xywh of the snapshot to make the top left corner of the snapshot align with the point
   * @param snapshot
   * @param point the point in model coordinate
   * @returns
   */
  private readonly _rewriteSnapshotXYWH = (
    snapshot: SliceSnapshot,
    point: Point,
    ignoreOriginalPos: boolean = false
  ) => {
    const rect = getSnapshotRect(snapshot) ?? new Bound(0, 0, 0, 0);
    const { x: modelX, y: modelY } = point;

    const rewrite = (block: BlockSnapshot) => {
      if (block.flavour === 'affine:surface') {
        if (block.props.elements) {
          Object.values(
            block.props.elements as Record<
              string,
              { type: string; xywh?: SerializedXYWH }
            >
          ).forEach(elem => {
            if (elem.type === 'connector') {
              assertType<{
                type: 'connector';
                xywh?: SerializedXYWH;
                source: { position: IVec; id?: string };
                target: { position: IVec; id?: string };
              }>(elem);

              const connectorBound = elem.xywh
                ? Bound.deserialize(elem.xywh)
                : new Bound(0, 0, 0, 0);

              delete elem.xywh;

              (['source', 'target'] as const).forEach(key => {
                const endpoint = elem[key];
                if (!endpoint.id) {
                  const originalPos = endpoint.position;

                  elem[key] = {
                    position: ignoreOriginalPos
                      ? [
                          originalPos[0] - connectorBound.x + modelX,
                          originalPos[1] - connectorBound.y + modelY,
                        ]
                      : [
                          originalPos[0] - rect.x + modelX,
                          originalPos[1] - rect.y + modelY,
                        ],
                  };
                }
              });
            }

            if (elem.xywh) {
              const elemBound = Bound.deserialize(elem.xywh);

              if (ignoreOriginalPos) {
                elemBound.x = modelX;
                elemBound.y = modelY;
                elem.xywh = elemBound.serialize();
              } else {
                elem.xywh = elemBound
                  .moveDelta(-rect.x + modelX, -rect.y + modelY)
                  .serialize();
              }
            }
          });
        }
        block.children.forEach(rewrite);
      } else {
        const schema = this.std.store.schema.get(block.flavour);
        const isGfxModel =
          schema?.model.toModel?.() instanceof GfxBlockElementModel;

        if (!isGfxModel) {
          return;
        }

        if (!block.props.xywh) {
          block.props.xywh =
            schema?.model.props?.(internalPrimitives).xywh ?? '[0,0,100,100]';
        }

        const blockBound =
          Bound.deserialize(block.props.xywh as SerializedXYWH) ??
          new Bound(0, 0, 0, 0);

        if (block.flavour === 'affine:embed-iframe') {
          let width = EMBED_IFRAME_DEFAULT_WIDTH_IN_SURFACE;
          let height = EMBED_IFRAME_DEFAULT_HEIGHT_IN_SURFACE;
          if (block.props.url && typeof block.props.url === 'string') {
            const embedIframeService = this.std.get(EmbedIframeService);
            const options = embedIframeService.getConfig(
              block.props.url
            )?.options;
            if (options) {
              width = options.widthInSurface;
              height = options.heightInSurface;
            }
          }
          blockBound.w = width;
          blockBound.h = height;
        } else if (
          block.flavour === 'affine:attachment' ||
          block.flavour === 'affine:bookmark' ||
          block.flavour.startsWith('affine:embed-')
        ) {
          const style = (block.props.style ?? 'vertical') as EmbedCardStyle;
          block.props.style = style;

          blockBound.w = EMBED_CARD_WIDTH[style];
          blockBound.h = EMBED_CARD_HEIGHT[style];
        }

        if (block.flavour === 'affine:image') {
          assertType<{ width: number; height: number }>(block.props);
          blockBound.w = blockBound.w || block.props.width || 100;
          blockBound.h = blockBound.h || block.props.height || 100;
        }

        if (ignoreOriginalPos) {
          blockBound.x = modelX;
          blockBound.y = modelY;
          block.props.xywh = blockBound.serialize();
        } else {
          block.props.xywh = blockBound
            .moveDelta(-rect.x + modelX, -rect.y + modelY)
            .serialize();
        }
      }
    };

    snapshot.content.forEach(rewrite);
  };

  get dndExtension() {
    return this.std.getOptional(DndApiExtensionIdentifier);
  }

  /**
   * This method will try to drop the snapshot as gfx block directly if all blocks can be dropped as gfx block.
   * Otherwise, it will create a linked doc to reference the original doc.
   * @param snapshot
   * @param point
   */
  private readonly _dropAsGfxBlock = (
    snapshot: SliceSnapshot,
    point: Point
  ) => {
    const store = this.widget.std.store;
    const schema = store.schema;

    point = Point.from(
      this.gfx.viewport.toModelCoordFromClientCoord([point.x, point.y])
    );

    // check if all blocks can be dropped as gfx block
    const groupByParent = groupBy(snapshot.content, block =>
      schema.safeValidate(block.flavour, 'affine:surface')
        ? 'affine:surface'
        : schema.safeValidate(block.flavour, 'affine:page')
          ? 'affine:page'
          : // if the parent is not surface or page, it can't be dropped as gfx block
            // mark it as empty
            'empty'
    );

    // empty means all blocks can be dropped as gfx block
    if (!groupByParent.empty?.length) {
      // drop as children of surface or page

      if (groupByParent['affine:surface']) {
        const content = groupByParent['affine:surface'];
        const surfaceSnapshot = {
          ...snapshot,
          content,
        };

        this._rewriteSnapshotXYWH(surfaceSnapshot, point, true);
        this._dropToModel(surfaceSnapshot, this.gfx.surface!.id)
          .then(slices => {
            slices?.content.forEach((block, idx) => {
              if (block.id === content[idx].id) {
                if (block.flavour === 'affine:embed-iframe') {
                  store.updateBlock(block.id, {
                    xywh: content[idx].props.xywh,
                  });
                } else if (
                  block.flavour === 'affine:image' ||
                  block.flavour === 'affine:attachment' ||
                  block.flavour === 'affine:bookmark' ||
                  block.flavour.startsWith('affine:embed-')
                ) {
                  store.updateBlock(block.id, {
                    xywh: content[idx].props.xywh,
                    style: content[idx].props.style,
                  });
                }
              }
            });
          })
          .catch(console.error);
      }

      if (groupByParent['affine:page']) {
        const content = groupByParent['affine:page'];
        const pageSnapshot = {
          ...snapshot,
          content,
        };

        this._rewriteSnapshotXYWH(pageSnapshot, point, true);
        this._dropToModel(pageSnapshot, this.widget.store.root!.id)
          .then(slices => {
            slices?.content.forEach((block, idx) => {
              if (block.flavour === 'affine:embed-iframe') {
                store.updateBlock(block.id, {
                  xywh: content[idx].props.xywh,
                });
              } else if (
                block.flavour === 'affine:attachment' ||
                block.flavour.startsWith('affine:embed-')
              ) {
                store.updateBlock(block.id, {
                  xywh: content[idx].props.xywh,
                  style: content[idx].props.style,
                });
              }
            });
          })
          .catch(console.error);
      }
    } else {
      const dndExtApi = this.dndExtension;
      const content = snapshot.content.filter(block =>
        schema.safeValidate(block.flavour, 'affine:note')
      );
      const sourceDocId = snapshot.pageId;

      if (
        dndExtApi &&
        this.std.store.workspace.docs.has(sourceDocId) &&
        this.gfx.surface &&
        snapshot.pageId !== this.std.store.doc.id
      ) {
        const style = 'vertical' as EmbedCardStyle;
        const linkedDocSnapshot = dndExtApi.fromEntity({
          docId: sourceDocId,
          props: {
            blockIds: content.map(block => block.id),
            style: 'vertical',
            xywh: new Bound(
              point.x,
              point.y,
              EMBED_CARD_WIDTH[style],
              EMBED_CARD_HEIGHT[style]
            ).serialize(),
          },
        });

        if (linkedDocSnapshot) {
          this._dropToModel(linkedDocSnapshot, this.gfx.surface.id).catch(
            console.error
          );
        }
      }
      // create note to wrap the snapshot
      else {
        const originalModel = store.getModelById(snapshot.content[0].id);
        const originalNote = originalModel
          ? findNoteBlockModel(originalModel)
          : null;

        let noteId: string;
        if (originalNote) {
          const placement =
            originalNote.children[0].id === snapshot.content[0].id
              ? 'before'
              : 'after';

          noteId = store.addSiblingBlocks(
            originalNote,
            [
              {
                flavour: 'affine:note',
                xywh: new Bound(
                  point.x,
                  point.y,
                  DEFAULT_NOTE_WIDTH,
                  DEFAULT_NOTE_HEIGHT
                ).serialize(),
              },
            ],
            placement
          )[0];
        } else {
          noteId = store.addBlock(
            'affine:note',
            {
              xywh: new Bound(
                point.x,
                point.y,
                DEFAULT_NOTE_WIDTH,
                DEFAULT_NOTE_HEIGHT
              ).serialize(),
            },
            this.widget.store.root!
          );
        }

        this._dropToModel(
          {
            ...snapshot,
            content,
          },
          noteId
        )
          .then(() => {
            const telemetry = this.std.getOptional(TelemetryProvider);
            telemetry?.track('CanvasElementAdded', {
              page: 'whiteboard editor',
              module: 'canvas',
              segment: 'whiteboard',
              control: 'canvas:drop',
              type: 'note',
              other: 'split-from-note',
            });
          })
          .catch(console.error);
      }
    }
  };

  private readonly _toSnapshot = (
    blocks: (BlockComponent | BlockModel)[],
    selectedGfxElms?: string[]
  ) => {
    const slice = Slice.fromModels(
      this.std.store,
      blocks.map(block =>
        toDraftModel(block instanceof BlockComponent ? block.model : block)
      )
    );
    const job = this._getJob(selectedGfxElms);

    const snapshot = job.sliceToSnapshot(slice);
    if (!snapshot) return;

    return snapshot;
  };

  private readonly _trackLinkedDocCreated = (id: string) => {
    const isNewBlock = !this.std.store.hasBlock(id);
    if (!isNewBlock) {
      return;
    }

    const mode =
      this.std.getOptional(DocModeProvider)?.getEditorMode() ?? 'page';

    const telemetryService = this.std.getOptional(TelemetryProvider);
    telemetryService?.track('LinkedDocCreated', {
      control: `drop on ${mode}`,
      module: 'drag and drop',
      type: 'doc',
      other: 'new doc',
    });
  };

  private readonly _setOpacityOfDraggedBlocks = (snapshot: SliceSnapshot) => {
    const OPACITY = 0.7;
    const gfx = this.gfx;
    const resetCallbacks: (() => void)[] = [];

    const traverse = (block: BlockSnapshot) => {
      if (block.flavour === 'affine:surface') {
        block.children.forEach(traverse);
        Object.keys(block.props.elements as Record<string, unknown>).forEach(
          elemId => {
            const element = gfx.getElementById(
              elemId
            ) as GfxPrimitiveElementModel;

            if (element) {
              const originalOpacity = element.opacity;
              element.opacity = OPACITY;
              resetCallbacks.push(() => {
                element.opacity = originalOpacity;
              });
            }
          }
        );
      } else {
        const blockView = this.std.view.getBlock(block.id);

        if (blockView) {
          const originalOpacity = blockView.style.opacity;
          blockView.style.opacity = `${OPACITY}`;
          resetCallbacks.push(() => {
            if (originalOpacity) {
              blockView.style.opacity = originalOpacity;
            } else {
              blockView.style.removeProperty('opacity');
            }
          });
        }
      }
    };

    snapshot.content.forEach(traverse);
    this.resetOpacityCallbacks = resetCallbacks;
  };

  constructor(readonly widget: AffineDragHandleWidget) {}

  private async _dropToModel(
    snapshot: SliceSnapshot,
    parent?: string,
    index?: number
  ) {
    try {
      const std = this.std;
      const job = this._getJob();

      if (snapshot.content.length === 1) {
        const [first] = snapshot.content;
        if (first.flavour === 'affine:embed-linked-doc') {
          this._trackLinkedDocCreated(first.id);
        }
      }
      // use snapshot
      const slice = await job.snapshotToSlice(
        snapshot,
        std.store,
        parent,
        index
      );
      return slice;
    } catch {
      return null;
    }
  }

  private _getJob(selectedIds?: string[]) {
    const std = this.std;
    const middlewares = [
      newIdCrossDoc(std),
      reorderList(std),
      surfaceRefToEmbed(std),
      cardStyleUpdater(std),
    ];

    if (selectedIds) {
      middlewares.push(gfxBlocksFilter(selectedIds, std));
    }

    return std.store.getTransformer(middlewares);
  }

  private _isDropOnCurrentEditor(std?: BlockStdScope) {
    return std === this.std;
  }

  private _isUnderNoteBlock(model: BlockModel) {
    let isUnderNote = false;
    const store = this.std.store;

    {
      let curModel = store.getParent(model);

      while (curModel) {
        if (matchModels(curModel, [NoteBlockModel])) {
          isUnderNote = true;
          break;
        }

        curModel = store.getParent(curModel)!;
      }
    }

    return isUnderNote;
  }

  private _makeDraggable(target: HTMLElement) {
    const std = this.std;

    return std.dnd.draggable<DragBlockEntity>({
      element: target,
      canDrag: () => (this.widget.anchorBlockId.peek() ? true : false),
      onDragStart: () => {
        this.widget.dragging = true;
      },
      onDrop: () => {
        this._cleanup();
      },
      setDragPreview: ({ source, container, setOffset }) => {
        if (
          !source.data?.bsEntity?.modelIds.length ||
          !source.data.bsEntity.snapshot
        ) {
          return;
        }

        const { snapshot, fromMode } = source.data.bsEntity;

        const offset = this.previewHelper.renderDragPreview({
          blockIds: source.data?.bsEntity?.modelIds,
          snapshot,
          container,
          mode: fromMode ?? 'block',
        });

        setOffset(offset);
      },
      setDragData: () => {
        const { fromMode, snapshot } = this._getDraggedSnapshot();

        snapshot && this._setOpacityOfDraggedBlocks(snapshot);

        return {
          type: 'blocks',
          fromMode,
          modelIds: snapshot ? extractIdsFromSnapshot(snapshot) : [],
          snapshot,
        };
      },
    });
  }

  private _makeDropTarget(view: BlockComponent) {
    const isUnderNote = this._isUnderNoteBlock(view.model);
    const isNote = matchModels(view.model, [NoteBlockModel]);

    if (
      // affine:surface block can't be drop target in any modes
      matchModels(view.model, [SurfaceBlockModel]) ||
      // in page mode, blocks other than root block can be drop target
      (this.mode === 'page' && view.model.role === 'root') ||
      // in edgeless mode, only root and note block can be drop target
      (this.mode === 'edgeless' &&
        !matchModels(view.model, [NoteBlockModel]) &&
        view.model.role !== 'root' &&
        !isUnderNote)
    ) {
      return;
    }

    const widget = this.widget;
    const cleanups: (() => void)[] = [];

    cleanups.push(
      this.std.dnd.dropTarget<
        DragBlockEntity,
        {
          modelId: string;
        }
      >({
        element: view,
        getIsSticky: () => {
          const result = this.mode === 'page' || isUnderNote;
          return result;
        },
        canDrop: ({ source }) => {
          /**
           * general rules:
           * 1. can't drop on the same block or its children
           */
          if (source.data.bsEntity?.type === 'blocks') {
            return (
              source.data.from?.docId !== widget.store.id ||
              source.data.bsEntity.modelIds.every(id => id !== view.model.id)
            );
          }

          return false;
        },
        onDragEnter: () => {
          if (isNote && 'hideMask' in view) {
            view.hideMask = true;
          }
        },
        onDragLeave: () => {
          if (isNote && 'hideMask' in view) {
            view.hideMask = false;
          }
        },
        onDrop: () => {
          if (isNote && 'hideMask' in view) {
            view.hideMask = false;
          }
        },
        setDropData: () => {
          return {
            modelId: view.model.id,
          };
        },
      })
    );

    if (matchModels(view.model, [AttachmentBlockModel, BookmarkBlockModel])) {
      cleanups.push(this._makeDraggable(view));
    }

    if (this.dropTargetCleanUps.has(view.model.id)) {
      this.dropTargetCleanUps.get(view.model.id)!.forEach(clean => clean());
    }

    this.dropTargetCleanUps.set(view.model.id, cleanups);
  }

  private _monitorBlockDrag() {
    return this.std.dnd.monitor<DragBlockEntity>({
      canMonitor: ({ source }) => {
        const entity = source.data?.bsEntity;

        return entity?.type === 'blocks' && !!entity.snapshot;
      },
      onDropTargetChange: ({ location }) => {
        this._clearDropIndicator();

        if (
          !this._isDropOnCurrentEditor(
            (location.current.dropTargets[0]?.element as BlockComponent)?.std
          )
        ) {
          return;
        }
      },
      onDrop: ({ location, source }) => {
        this._clearDropIndicator();

        if (
          !this._isDropOnCurrentEditor(
            (location.current.dropTargets[0]?.element as BlockComponent)?.std
          )
        ) {
          return;
        }

        const target = location.current.dropTargets[0];
        const point = new Point(
          location.current.input.clientX,
          location.current.input.clientY
        );
        const dragPayload = source.data;
        const dropPayload = target.data;

        this._onDrop(
          target.element as BlockComponent,
          dragPayload,
          dropPayload,
          point
        );
      },
      onDrag: ({ location, source }) => {
        if (
          !this._isDropOnCurrentEditor(
            (location.current.dropTargets[0]?.element as BlockComponent)?.std
          ) ||
          !location.current.dropTargets[0]
        ) {
          return;
        }

        const target = location.current.dropTargets[0];
        const point = new Point(
          location.current.input.clientX,
          location.current.input.clientY
        );
        const dragPayload = source.data;
        const dropPayload = target.data;

        this._onDragMove(
          point,
          dragPayload,
          dropPayload,
          target.element as BlockComponent
        );
      },
    });
  }

  watch() {
    this.widget.handleEvent('pointerDown', ctx => {
      const state = ctx.get('pointerState');
      const event = state.raw;
      const target = captureEventTarget(event.target);
      if (!target) return;

      if (this.widget.contains(target)) {
        return true;
      }

      return;
    });

    this.widget.handleEvent('dragStart', ctx => {
      const state = ctx.get('pointerState');
      const event = state.raw;
      const target = captureEventTarget(event.target);
      if (!target) return;

      if (this.widget.contains(target)) {
        return true;
      }

      return;
    });

    const widget = this.widget;
    const std = this.std;
    const disposables = widget.disposables;
    const scrollable = getScrollContainer(this.host);

    if (scrollable && this.mode === 'page') {
      disposables.add(
        std.dnd.autoScroll<DragBlockEntity>({
          element: scrollable,
          canScroll: ({ source }) => {
            return source.data?.bsEntity?.type === 'blocks';
          },
        })
      );
    }

    disposables.add(this._makeDraggable(this.widget));

    // used to handle drag move and drop
    disposables.add(this._monitorBlockDrag());

    disposables.add(
      std.view.viewUpdated.subscribe(payload => {
        if (payload.type !== 'block') {
          return;
        }
        if (payload.method === 'add') {
          this._makeDropTarget(payload.view);
        } else if (
          payload.method === 'delete' &&
          this.dropTargetCleanUps.has(payload.id)
        ) {
          this.dropTargetCleanUps.get(payload.id)!.forEach(clean => clean());
          this.dropTargetCleanUps.delete(payload.id);
        }
      })
    );

    std.view.views.forEach(block => this._makeDropTarget(block));

    disposables.add(() => {
      this.dropTargetCleanUps.forEach(cleanUps => cleanUps.forEach(fn => fn()));
      this.dropTargetCleanUps.clear();
    });
  }
}
