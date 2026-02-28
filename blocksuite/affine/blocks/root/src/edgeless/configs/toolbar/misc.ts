import { EdgelessFrameManagerIdentifier } from '@blocksuite/affine-block-frame';
import {
  EdgelessCRUDIdentifier,
  getSurfaceComponent,
} from '@blocksuite/affine-block-surface';
import { ConnectorTool } from '@blocksuite/affine-gfx-connector';
import {
  createGroupCommand,
  createGroupFromSelectedCommand,
  ungroupCommand,
} from '@blocksuite/affine-gfx-group';
import {
  ConnectorElementModel,
  DEFAULT_CONNECTOR_MODE,
  GroupElementModel,
  MindmapElementModel,
} from '@blocksuite/affine-model';
import {
  ActionPlacement,
  blockCommentToolbarButton,
  type ElementLockEvent,
  type ToolbarAction,
  type ToolbarContext,
  type ToolbarModuleConfig,
} from '@blocksuite/affine-shared/services';
import { Bound } from '@blocksuite/global/gfx';
import {
  AlignLeftIcon,
  ConnectorCIcon,
  FrameIcon,
  GroupingIcon,
  LockIcon,
  ReleaseFromGroupIcon,
  UnlockIcon,
} from '@blocksuite/icons/lit';
import type { GfxModel } from '@blocksuite/std/gfx';
import { html } from 'lit';

import { renderAlignmentMenu } from './alignment';
import { moreActions } from './more';

export const builtinMiscToolbarConfig = {
  actions: [
    {
      placement: ActionPlacement.Start,
      id: 'a.release-from-group',
      tooltip: 'Release from group',
      icon: ReleaseFromGroupIcon(),
      when(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length !== 1) return false;
        return ctx.matchModel(models[0].group, GroupElementModel);
      },
      run(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length !== 1) return;

        const firstModel = models[0];
        if (firstModel.isLocked()) return;
        if (!ctx.matchModel(firstModel.group, GroupElementModel)) return;

        const group = firstModel.group;

        // oxlint-disable-next-line unicorn/prefer-dom-node-remove
        group.removeChild(firstModel);

        firstModel.index = ctx.gfx.layer.generateIndex();

        const parent = group.group;
        if (parent && parent instanceof GroupElementModel) {
          parent.addChild(firstModel);
        }
      },
    },
    {
      placement: ActionPlacement.Start,
      id: 'b.add-frame',
      label: 'Frame',
      showLabel: true,
      tooltip: 'Frame',
      icon: FrameIcon(),
      when(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length < 2) return false;
        if (
          models.some(model => ctx.matchModel(model.group, MindmapElementModel))
        )
          return false;
        if (
          models.length ===
          models.filter(model => model instanceof ConnectorElementModel).length
        )
          return false;

        return true;
      },
      run(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length < 2) return;

        const surface = getSurfaceComponent(ctx.std);
        if (!surface) return;

        const frameManager = ctx.std.get(EdgelessFrameManagerIdentifier);

        const frame = frameManager.createFrameOnSelected();
        if (!frame) return;

        // TODO(@fundon): should be a command
        surface.fitToViewport(Bound.deserialize(frame.xywh));

        ctx.track('CanvasElementAdded', {
          control: 'context-menu',
          type: 'frame',
        });
      },
    },
    {
      placement: ActionPlacement.Start,
      id: 'c.add-group',
      label: 'Group',
      showLabel: true,
      tooltip: 'Group',
      icon: GroupingIcon(),
      when(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length < 2) return false;
        if (ctx.matchModel(models[0], GroupElementModel)) return false;
        if (
          models.some(model => ctx.matchModel(model.group, MindmapElementModel))
        )
          return false;
        if (
          models.length ===
          models.filter(model => ctx.matchModel(model, ConnectorElementModel))
            .length
        )
          return false;

        return true;
      },
      run(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length < 2) return;

        // TODO(@fundon): should be a command
        ctx.command.exec(createGroupFromSelectedCommand);
      },
    },
    {
      placement: ActionPlacement.Start,
      id: 'd.alignment',
      when(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length < 2) return false;
        if (models.some(model => model.group instanceof MindmapElementModel))
          return false;
        if (
          models.length ===
          models.filter(model => model instanceof ConnectorElementModel).length
        )
          return false;

        return true;
      },
      content(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length < 2) return null;

        return renderAlignmentMenu(ctx, models, {
          icon: AlignLeftIcon(),
          label: 'Align objects',
          tooltip: 'Align objects',
        });
      },
    },
    {
      placement: ActionPlacement.End,
      id: 'a.draw-connector',
      label: 'Draw connector',
      tooltip: 'Draw connector',
      icon: ConnectorCIcon(),
      when(ctx) {
        const models = ctx.getSurfaceModels();
        if (models.length !== 1) return false;
        return !ctx.matchModel(models[0], ConnectorElementModel);
      },
      content(ctx) {
        const models = ctx.getSurfaceModels();
        if (!models.length) return null;

        const { label, icon, tooltip } = this;

        const quickConnect = (e: MouseEvent) => {
          e.stopPropagation();

          const { x, y } = e;
          const point = ctx.gfx.viewport.toViewCoordFromClientCoord([x, y]);

          ctx.store.captureSync();
          ctx.gfx.tool.setTool(ConnectorTool, { mode: DEFAULT_CONNECTOR_MODE });

          const ctc = ctx.gfx.tool.get(ConnectorTool);
          ctc.quickConnect(point, models[0]);
        };

        return html`
          <editor-icon-button
            data-testid="${'draw-connector'}"
            aria-label=${label}
            .tooltip=${tooltip}
            @click=${quickConnect}
          >
            ${icon}
          </editor-icon-button>
        `;
      },
    } satisfies ToolbarAction,
    {
      placement: ActionPlacement.End,
      id: 'b.lock',
      tooltip: 'Lock',
      icon: LockIcon(),
      run(ctx) {
        const models = ctx.getSurfaceModels();
        if (!models.length) return;

        // get most top selected elements(*) from tree, like in a tree below
        //         G0
        //        /  \
        //      E1*  G1
        //          /  \
        //        E2*  E3*
        //
        // (*) selected elements, [E1, E2, E3]
        // return [E1]

        const elements = Array.from(
          new Set(
            models.map(model =>
              ctx.matchModel(model.group, MindmapElementModel)
                ? model.group
                : model
            )
          )
        );

        const levels = elements.map(element => element.groups.length);
        const topElement = elements[levels.indexOf(Math.min(...levels))];
        const otherElements = elements.filter(
          element => element !== topElement
        );

        ctx.store.captureSync();

        // release other elements from their groups and group with top element
        otherElements.forEach(element => {
          // oxlint-disable-next-line unicorn/prefer-dom-node-remove
          element.group?.removeChild(element);
          topElement.group?.addChild(element);
        });

        if (otherElements.length === 0) {
          topElement.lock();

          ctx.gfx.selection.set({
            editing: false,
            elements: [topElement.id],
          });

          track(ctx, topElement, 'lock');
          return;
        }

        const [_, { groupId }] = ctx.command.exec(createGroupCommand, {
          elements: [topElement, ...otherElements],
        });

        if (groupId) {
          const element = ctx.std
            .get(EdgelessCRUDIdentifier)
            .getElementById(groupId);

          if (element) {
            element.lock();
            ctx.gfx.selection.set({
              editing: false,
              elements: [groupId],
            });

            track(ctx, element, 'group-lock');
            return;
          }
        }

        for (const element of elements) {
          element.lock();

          track(ctx, element, 'lock');
        }

        ctx.gfx.selection.set({
          editing: false,
          elements: elements.map(e => e.id),
        });
      },
    },

    {
      placement: ActionPlacement.End,
      id: 'c.comment',
      ...blockCommentToolbarButton,
    },

    // More actions
    ...moreActions.map(action => ({
      ...action,
      placement: ActionPlacement.More,
    })),
  ],
  when(ctx) {
    const models = ctx.getSurfaceModels();
    return models.length > 0 && !models.some(model => model.isLocked());
  },
} as const satisfies ToolbarModuleConfig;

export const builtinLockedToolbarConfig = {
  actions: [
    {
      placement: ActionPlacement.End,
      id: 'b.unlock',
      label: 'Click to unlock',
      showLabel: true,
      icon: UnlockIcon(),
      run(ctx) {
        const models = ctx.getSurfaceModels();
        if (!models.length) return;

        const elements = new Set(
          models.map(model =>
            ctx.matchModel(model.group, MindmapElementModel)
              ? model.group
              : model
          )
        );

        ctx.store.captureSync();

        for (const element of elements) {
          if (element instanceof GroupElementModel) {
            ctx.command.exec(ungroupCommand, { group: element });
          } else {
            element.lockedBySelf = false;
          }

          track(ctx, element, 'unlock');
        }
      },
    },
  ],
  when: ctx => ctx.getSurfaceModels().some(model => model.isLocked()),
} as const satisfies ToolbarModuleConfig;

function track(
  ctx: ToolbarContext,
  element: GfxModel,
  control: ElementLockEvent['control']
) {
  ctx.track('EdgelessElementLocked', {
    control,
    type:
      'type' in element
        ? element.type
        : (element.flavour.split(':')[1] ?? element.flavour),
  });
}
