import { AttachmentBlockComponent } from '@blocksuite/affine-block-attachment';
import { BookmarkBlockComponent } from '@blocksuite/affine-block-bookmark';
import {
  isExternalEmbedBlockComponent,
  notifyDocCreated,
  promptDocTitle,
} from '@blocksuite/affine-block-embed';
import { EdgelessFrameManagerIdentifier } from '@blocksuite/affine-block-frame';
import { ImageBlockComponent } from '@blocksuite/affine-block-image';
import {
  EdgelessCRUDIdentifier,
  getSurfaceComponent,
} from '@blocksuite/affine-block-surface';
import {
  ConnectorPathGenerator,
  pointToSegmentDistance,
} from '@blocksuite/affine-gfx-connector';
import { createGroupFromSelectedCommand } from '@blocksuite/affine-gfx-group';
import {
  AttachmentBlockModel,
  BookmarkBlockModel,
  ConnectorElementModel,
  EmbedLinkedDocBlockSchema,
  EmbedLinkedDocModel,
  EmbedSyncedDocBlockSchema,
  EmbedSyncedDocModel,
  FrameBlockModel,
  ImageBlockModel,
  isExternalEmbedModel,
  MindmapElementModel,
  NoteBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import type {
  ToolbarActions,
  ToolbarContext,
} from '@blocksuite/affine-shared/services';
import {
  matchModels,
  type ReorderingType,
} from '@blocksuite/affine-shared/utils';
import type { IVec } from '@blocksuite/global/gfx';
import {
  Bound,
  getCommonBoundWithRotation,
  PointLocation,
} from '@blocksuite/global/gfx';
import {
  ArrowDownBigBottomIcon,
  ArrowDownBigIcon,
  ArrowUpBigIcon,
  ArrowUpBigTopIcon,
  BanIcon,
  CopyIcon,
  DeleteIcon,
  DuplicateIcon,
  FrameIcon,
  GroupIcon,
  LinkedPageIcon,
  PlusIcon,
  ResetIcon,
} from '@blocksuite/icons/lit';
import type { BlockComponent } from '@blocksuite/std';
import { GfxBlockElementModel, type GfxModel } from '@blocksuite/std/gfx';

import { EdgelessClipboardController } from '../../clipboard/clipboard';
import { duplicate } from '../../utils/clipboard-utils';
import { getSortedCloneElements } from '../../utils/clone-utils';
import { moveConnectors } from '../../utils/connector';
import { deleteElements } from '../../utils/crud';
import {
  createLinkedDocFromEdgelessElements,
  createLinkedDocFromNote,
} from './render-linked-doc';
import { getEdgelessWith } from './utils';

export const moreActions = [
  // Selection Group: frame & group
  {
    id: 'Z.a.selection',
    actions: [
      {
        id: 'a.create-frame',
        label: 'Frame section',
        icon: FrameIcon(),
        run(ctx) {
          const frame = ctx.std
            .get(EdgelessFrameManagerIdentifier)
            .createFrameOnSelected();
          if (!frame) return;

          const surface = getSurfaceComponent(ctx.std);
          if (!surface) return;

          surface.fitToViewport(Bound.deserialize(frame.xywh));

          ctx.track('CanvasElementAdded', {
            control: 'context-menu',
            type: 'frame',
          });
        },
      },
      {
        id: 'b.create-group',
        label: 'Group section',
        icon: GroupIcon(),
        when(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length === 0) return false;
          return !models.some(model => ctx.matchModel(model, FrameBlockModel));
        },
        run(ctx) {
          ctx.command.exec(createGroupFromSelectedCommand);
        },
      },
    ],
  },

  // Reordering Group
  {
    id: 'Z.b.reordering',
    actions: [
      {
        id: 'a.bring-to-front',
        label: 'Bring to Front',
        icon: ArrowUpBigTopIcon(),
        run(ctx) {
          const models = ctx.getSurfaceModels();
          reorderElements(ctx, models, 'front');
        },
      },
      {
        id: 'b.bring-forward',
        label: 'Bring Forward',
        icon: ArrowUpBigIcon(),
        run(ctx) {
          const models = ctx.getSurfaceModels();
          reorderElements(ctx, models, 'forward');
        },
      },
      {
        id: 'c.send-backward',
        label: 'Send Backward',
        icon: ArrowDownBigIcon(),
        run(ctx) {
          const models = ctx.getSurfaceModels();
          reorderElements(ctx, models, 'backward');
        },
      },
      {
        id: 'c.send-to-back',
        label: 'Send to Back',
        icon: ArrowDownBigBottomIcon(),
        run(ctx) {
          const models = ctx.getSurfaceModels();
          reorderElements(ctx, models, 'back');
        },
      },
    ],
  },

  // Clipboard Group
  // Uses the same `ID` for both page and edgeless modes.
  {
    id: 'a.clipboard',
    actions: [
      {
        id: 'copy',
        label: 'Copy',
        icon: CopyIcon(),
        run(ctx) {
          const models = ctx.getSurfaceModels();
          if (!models.length) return;

          const edgelessClipboard = ctx.std.getOptional(
            EdgelessClipboardController
          );
          if (!edgelessClipboard) return;

          edgelessClipboard.copy();
        },
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: DuplicateIcon(),
        run(ctx) {
          const models = ctx.getSurfaceModels();
          if (!models.length) return;

          const edgeless = getEdgelessWith(ctx);
          if (!edgeless) return;

          duplicate(edgeless, models).catch(console.error);
        },
      },
      {
        id: 'reload',
        label: 'Reload',
        icon: ResetIcon(),
        when(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length === 0) return false;
          return models.every(isRefreshableModel);
        },
        run(ctx) {
          const blocks = ctx
            .getSurfaceModels()
            .map(model => ctx.view.getBlock(model.id))
            .filter(isRefreshableBlock);

          if (!blocks.length) return;

          for (const block of blocks) {
            block.refreshData();
          }
        },
      },
    ],
  },

  // Conversions Group
  {
    id: 'd.conversions',
    actions: [
      {
        id: 'a.turn-into-linked-doc',
        label: 'Turn into linked doc',
        icon: LinkedPageIcon(),
        when(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length !== 1) return false;
          return ctx.matchModel(models[0], NoteBlockModel);
        },
        run(ctx) {
          const model = ctx.getCurrentModelByType(NoteBlockModel);
          if (!model) return;

          let placeholder = '';
          for (const child of model.children) {
            if (matchModels(child, [ParagraphBlockModel])) {
              if (child.props.text.length === 0) continue;
              placeholder = child.props.text.toString();
              break;
            }
            break;
          }

          const create = async () => {
            const title = await promptDocTitle(ctx.std, placeholder);
            if (title === null) return;

            const edgeless = getEdgelessWith(ctx);
            if (!edgeless) return;

            const surfaceId = edgeless.surfaceBlockModel.id;
            if (!surfaceId) return;

            const linkedDoc = createLinkedDocFromNote(ctx.store, model, title);
            if (!linkedDoc) return;

            // Inserts linked doc card
            const cardId = ctx.std.get(EdgelessCRUDIdentifier).addBlock(
              EmbedSyncedDocBlockSchema.model.flavour,
              {
                xywh: model.xywh,
                style: 'syncedDoc',
                pageId: linkedDoc.id,
                index: model.index,
              },
              surfaceId
            );

            ctx.track('CanvasElementAdded', {
              control: 'context-menu',
              type: 'embed-synced-doc',
            });
            ctx.track('DocCreated', {
              control: 'turn into linked doc',
              type: 'embed-linked-doc',
            });
            ctx.track('LinkedDocCreated', {
              control: 'turn into linked doc',
              type: 'embed-linked-doc',
              other: 'new doc',
            });

            moveConnectors(model.id, cardId, ctx.std);

            // Deletes selected note
            ctx.store.transact(() => {
              ctx.store.deleteBlock(model);
            });
            ctx.gfx.selection.set({
              elements: [cardId],
              editing: false,
            });
          };

          create().catch(console.error);
        },
      },
      {
        id: 'b.create-linked-doc',
        label: 'Create linked doc',
        icon: LinkedPageIcon(),
        when(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length === 0) return false;
          if (models.length === 1) {
            return ![
              NoteBlockModel,
              EmbedLinkedDocModel,
              EmbedSyncedDocModel,
            ].some(k => ctx.matchModel(models[0], k));
          }
          return true;
        },
        run(ctx) {
          const models = ctx.getSurfaceModels();
          if (!models.length) return;

          const create = async () => {
            const edgeless = getEdgelessWith(ctx);
            if (!edgeless) return;

            const surfaceId = edgeless.surfaceBlockModel.id;
            if (!surfaceId) return;

            const title = await promptDocTitle(ctx.std);
            if (title === null) return;

            const clonedModels = getSortedCloneElements(models);
            const linkedDoc = createLinkedDocFromEdgelessElements(
              ctx.host,
              clonedModels,
              title
            );

            ctx.store.transact(() => {
              deleteElements(edgeless, clonedModels);
            });

            // Inserts linked doc card
            const width = 364;
            const height = 390;
            const bound = getCommonBoundWithRotation(clonedModels);
            const cardId = ctx.std.get(EdgelessCRUDIdentifier).addBlock(
              EmbedLinkedDocBlockSchema.model.flavour,
              {
                xywh: `[${bound.center[0] - width / 2}, ${bound.center[1] - height / 2}, ${width}, ${height}]`,
                style: 'vertical',
                pageId: linkedDoc.id,
              },
              surfaceId
            );

            ctx.gfx.selection.set({
              elements: [cardId],
              editing: false,
            });

            ctx.track('CanvasElementAdded', {
              control: 'context-menu',
              type: 'embed-linked-doc',
            });
            ctx.track('DocCreated', {
              control: 'create linked doc',
              type: 'embed-linked-doc',
            });
            ctx.track('LinkedDocCreated', {
              control: 'create linked doc',
              type: 'embed-linked-doc',
              other: 'new doc',
            });

            notifyDocCreated(ctx.std);
          };

          create().catch(console.error);
        },
      },
    ],
  },

  // Connector Waypoints Group
  {
    id: 'd.waypoints',
    actions: [
      {
        id: 'a.add-waypoint',
        label: 'Add waypoint',
        icon: PlusIcon(),
        when(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length !== 1) return false;
          return ctx.matchModel(models[0], ConnectorElementModel);
        },
        run(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length !== 1) return;

          const model = models[0];
          if (!ctx.matchModel(model, ConnectorElementModel)) return;

          const connector = model as ConnectorElementModel;
          const { viewport } = ctx.gfx;

          const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
              cleanup();
            }
          };

          const onPointerDown = (e: PointerEvent) => {
            cleanup();

            const path = connector.absolutePath;
            if (!path || path.length < 2) return;

            const [x, y] = viewport.toModelCoordFromClientCoord([e.x, e.y]);

            let minDist = Infinity;
            let segmentIndex = -1;
            for (let i = 0; i < path.length - 1; i++) {
              const p0 = path[i];
              const p1 = path[i + 1];
              const dist = pointToSegmentDistance(
                x,
                y,
                p0[0],
                p0[1],
                p1[0],
                p1[1]
              );
              if (dist < minDist) {
                minDist = dist;
                segmentIndex = i;
              }
            }

            if (segmentIndex < 0 || minDist > 8) return;

            const start = path[segmentIndex];
            const end = path[segmentIndex + 1];
            const midpoint: IVec = [
              (start[0] + end[0]) / 2,
              (start[1] + end[1]) / 2,
            ];

            const newPath = path.map(p => new PointLocation([p[0], p[1]]));
            // Insert a duplicate midpoint to create a zero-length perpendicular
            // segment that becomes draggable once expanded.
            newPath.splice(
              segmentIndex + 1,
              0,
              new PointLocation(midpoint),
              new PointLocation(midpoint)
            );

            const waypoints = newPath
              .slice(1, -1)
              .map(p => [p[0], p[1]] as IVec);

            ctx.store.transact(() => {
              ctx.store.captureSync();
              connector.waypoints =
                waypoints.length > 0 ? waypoints : undefined;
            });

            ConnectorPathGenerator.updatePath(
              connector,
              null,
              id =>
                ctx.gfx.surface?.getElementById(id) ??
                (ctx.std.store.getModelById(id) as GfxModel | null)
            );

            ctx.gfx.selection.set({ elements: [], editing: false });
            queueMicrotask(() => {
              ctx.gfx.selection.set({
                elements: [connector.id],
                editing: false,
              });
            });
          };

          const cleanup = () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
          };

          document.addEventListener('pointerdown', onPointerDown, true);
          document.addEventListener('keydown', onKeyDown, true);
        },
      },
      {
        id: 'a.clear-waypoints',
        label: 'Clear waypoints',
        icon: BanIcon(),
        when(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length !== 1) return false;
          return ctx.matchModel(models[0], ConnectorElementModel);
        },
        run(ctx) {
          const models = ctx.getSurfaceModels();
          if (models.length !== 1) return;

          const model = models[0];
          if (!ctx.matchModel(model, ConnectorElementModel)) return;

          ctx.store.transact(() => {
            ctx.store.captureSync();
            (model as ConnectorElementModel).waypoints = undefined;
          });
          ConnectorPathGenerator.updatePath(
            model as ConnectorElementModel,
            null,
            id =>
              ctx.gfx.surface?.getElementById(id) ??
              (ctx.std.store.getModelById(id) as GfxModel | null)
          );
          ctx.gfx.selection.set({ elements: [], editing: false });
          queueMicrotask(() => {
            ctx.gfx.selection.set({
              elements: [model.id],
              editing: false,
            });
          });
        },
      },
    ],
  },

  // Deleting Group
  {
    id: 'e.delete',
    label: 'Delete',
    icon: DeleteIcon(),
    variant: 'destructive',
    run(ctx) {
      const models = ctx.getSurfaceModels();
      if (!models.length) return;

      const edgeless = getEdgelessWith(ctx);
      if (!edgeless) return;

      ctx.store.captureSync();

      deleteElements(edgeless, models);

      // Clears
      ctx.select('surface');
      ctx.reset();
    },
  },
] as const satisfies ToolbarActions;

function reorderElements(
  ctx: ToolbarContext,
  models: GfxModel[],
  type: ReorderingType
) {
  if (!models.length) return;

  const normalizedModels = Array.from(
    new Map(
      models.map(model => {
        const reorderTarget =
          model.group instanceof MindmapElementModel ? model.group : model;
        return [reorderTarget.id, reorderTarget];
      })
    ).values()
  );

  for (const model of normalizedModels) {
    const index = ctx.gfx.layer.getReorderedIndex(model, type);

    // block should be updated in transaction
    if (model instanceof GfxBlockElementModel) {
      ctx.store.transact(() => {
        model.index = index;
      });
    } else {
      model.index = index;
    }
  }
}

function isRefreshableModel(model: GfxModel) {
  return (
    model instanceof AttachmentBlockModel ||
    model instanceof BookmarkBlockModel ||
    model instanceof ImageBlockModel ||
    isExternalEmbedModel(model)
  );
}

function isRefreshableBlock(block: BlockComponent | null) {
  return (
    !!block &&
    (block instanceof AttachmentBlockComponent ||
      block instanceof BookmarkBlockComponent ||
      block instanceof ImageBlockComponent ||
      isExternalEmbedBlockComponent(block))
  );
}
