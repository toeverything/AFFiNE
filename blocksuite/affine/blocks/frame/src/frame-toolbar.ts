import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  packColor,
  type PickColorEvent,
} from '@blocksuite/affine-components/color-picker';
import { toast } from '@blocksuite/affine-components/toast';
import {
  DEFAULT_NOTE_HEIGHT,
  DefaultTheme,
  FrameBlockModel,
  FrameBlockSchema,
  NoteBlockModel,
  NoteBlockSchema,
  NoteDisplayMode,
  resolveColor,
  SurfaceRefBlockSchema,
} from '@blocksuite/affine-model';
import {
  NotificationProvider,
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import {
  getMostCommonResolvedValue,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { mountFrameTitleEditor } from '@blocksuite/affine-widget-frame-title';
import { Bound } from '@blocksuite/global/gfx';
import {
  EditIcon,
  InsertIntoPageIcon,
  UngroupIcon,
} from '@blocksuite/icons/lit';
import { type BlockComponent, BlockFlavourIdentifier } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { ExtensionType } from '@blocksuite/store';
import { html } from 'lit';

import { EdgelessFrameManagerIdentifier } from './frame-manager';

function getRootBlock(ctx: ToolbarContext): BlockComponent | null {
  const rootModel = ctx.store.root;
  if (!rootModel) return null;

  return ctx.view.getBlock(rootModel.id);
}

const builtinSurfaceToolbarConfig = {
  actions: [
    {
      id: 'a.insert-into-page',
      label: 'Insert into Page',
      tooltip: 'Insert into Page',
      icon: InsertIntoPageIcon(),
      when: ctx => ctx.getSurfaceModelsByType(FrameBlockModel).length === 1,
      run(ctx) {
        const model = ctx.getCurrentModelByType(FrameBlockModel);
        if (!model) return;

        const rootModel = ctx.store.root;
        if (!rootModel) return;

        const { id: frameId, xywh } = model;
        let lastNoteId = rootModel.children.findLast(
          note =>
            matchModels(note, [NoteBlockModel]) &&
            note.props.displayMode !== NoteDisplayMode.EdgelessOnly
        )?.id;

        if (!lastNoteId) {
          const bounds = Bound.deserialize(xywh);
          bounds.y += bounds.h;
          bounds.h = DEFAULT_NOTE_HEIGHT;

          lastNoteId = ctx.store.addBlock(
            NoteBlockSchema.model.flavour,
            { xywh: bounds.serialize() },
            rootModel.id
          );
        }

        ctx.store.captureSync();
        ctx.store.addBlock(
          SurfaceRefBlockSchema.model.flavour,
          { reference: frameId, refFlavour: FrameBlockSchema.model.flavour },
          lastNoteId
        );

        const notification = ctx.std.getOptional(NotificationProvider);
        if (notification) {
          notification.notifyWithUndoAction({
            title: 'Frame inserted into Page.',
            message: 'Frame has been inserted into doc',
            accent: 'success',
          });
        } else {
          toast(ctx.host, 'Frame has been inserted into doc');
        }
      },
    },
    {
      id: 'b.rename',
      tooltip: 'Rename',
      icon: EditIcon(),
      when: ctx => ctx.getSurfaceModelsByType(FrameBlockModel).length === 1,
      run(ctx) {
        const model = ctx.getCurrentModelByType(FrameBlockModel);
        if (!model) return;

        const rootBlock = getRootBlock(ctx);
        if (!rootBlock) return;

        mountFrameTitleEditor(model, rootBlock);
      },
    },
    {
      id: 'b.ungroup',
      tooltip: 'Ungroup',
      icon: UngroupIcon(),
      run(ctx) {
        const models = ctx.getSurfaceModelsByType(FrameBlockModel);
        if (!models.length) return;

        const crud = ctx.std.get(EdgelessCRUDIdentifier);
        const gfx = ctx.std.get(GfxControllerIdentifier);

        ctx.store.captureSync();

        const frameManager = ctx.std.get(EdgelessFrameManagerIdentifier);

        for (const model of models) {
          frameManager.removeAllChildrenFromFrame(model);
        }

        for (const model of models) {
          crud.removeElement(model.id);
        }

        gfx.selection.clear();
      },
    },
    {
      id: 'c.color-picker',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(FrameBlockModel);
        if (!models.length) return null;

        const enableCustomColor = ctx.features.getFlag('enable_color_picker');
        const theme = ctx.theme.edgeless$.value;

        const field = 'background';
        const firstModel = models[0];
        const background =
          getMostCommonResolvedValue(
            models.map(model => model.props),
            field,
            background => resolveColor(background, theme)
          ) ?? DefaultTheme.transparent;
        const onPick = (e: PickColorEvent) => {
          switch (e.type) {
            case 'pick':
              {
                const color = e.detail.value;
                const props = packColor(field, color);
                const crud = ctx.std.get(EdgelessCRUDIdentifier);
                models.forEach(model => {
                  crud.updateElement(model.id, props);
                });
              }
              break;
            case 'start':
              ctx.store.captureSync();
              models.forEach(model => {
                model.stash(field);
              });
              break;
            case 'end':
              ctx.store.transact(() => {
                models.forEach(model => {
                  model.pop(field);
                });
              });
              break;
          }
        };

        return html`
          <edgeless-color-picker-button
            class="background"
            .label="${'Background'}"
            .pick=${onPick}
            .color=${background}
            .theme=${theme}
            .originalColor=${firstModel.props.background}
            .enableCustomColor=${enableCustomColor}
          >
          </edgeless-color-picker-button>
        `;
      },
    },
  ],

  when: ctx => ctx.getSurfaceModelsByType(FrameBlockModel).length > 0,
} as const satisfies ToolbarModuleConfig;

const createFrameToolbarConfig = (flavour: string): ExtensionType => {
  const name = flavour.split(':').pop();

  return ToolbarModuleExtension({
    id: BlockFlavourIdentifier(`affine:surface:${name}`),
    config: builtinSurfaceToolbarConfig,
  });
};

export const frameToolbarExtension = createFrameToolbarConfig(
  FrameBlockSchema.model.flavour
);
