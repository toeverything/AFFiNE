import { CalloutBlockModel, DefaultTheme } from '@blocksuite/affine-model';
import {
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { PaletteIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { html } from 'lit';

const backgroundColorAction = {
  id: 'background-color',
  label: 'Background Color',
  tooltip: 'Change background color',
  icon: PaletteIcon(),
  run() {
    // This will be handled by the content function
  },
  content(ctx) {
    const model = ctx.getCurrentModelByType(CalloutBlockModel);
    if (!model) return null;

    const currentBackground = model.props.background;
    const colors = DefaultTheme.NoteBackgroundColorPalettes;

    return html`
      <div
        style="display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; max-width: 200px;"
      >
        ${colors.map(
          color => html`
            <button
              style="width: 24px; height: 24px; border-radius: 4px; border: 2px solid ${currentBackground ===
              color.value
                ? 'var(--affine-primary-color)'
                : 'transparent'}; background-color: ${color.value}; cursor: pointer; padding: 0; margin: 0;"
              @click=${() => {
                ctx.store.updateBlock(model, { background: color.value });
              }}
              title=${color.key}
            ></button>
          `
        )}
      </div>
    `;
  },
} satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    {
      id: 'style',
      actions: [backgroundColorAction],
    } satisfies ToolbarActionGroup<ToolbarAction>,
  ],
} as const satisfies ToolbarModuleConfig;

export const createBuiltinToolbarConfigExtension = (
  flavour: string
): ExtensionType[] => {
  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(flavour),
      config: builtinToolbarConfig,
    }),
  ];
};
