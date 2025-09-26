import { EditorChevronDown } from '@blocksuite/affine-components/toolbar';
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
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

const colors = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'grey',
] as const;

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

    const updateBackground = (color: string) => {
      // Map text highlight colors to note background colors
      const colorMap: Record<
        string,
        keyof typeof DefaultTheme.NoteBackgroundColorMap | null
      > = {
        default: null,
        red: 'Red',
        orange: 'Orange',
        yellow: 'Yellow',
        green: 'Green',
        teal: 'Green', // Map teal to green as it's not available in NoteBackgroundColorMap
        blue: 'Blue',
        purple: 'Purple',
        grey: 'White', // Map grey to white as it's the closest available
      };

      const mappedColor = colorMap[color];
      const backgroundValue = mappedColor
        ? DefaultTheme.NoteBackgroundColorMap[mappedColor]
        : null;
      ctx.store.updateBlock(model, { background: backgroundValue });
    };

    return html`
      <editor-menu-button
        .contentPadding=${'8px'}
        .button=${html`
          <editor-icon-button
            aria-label="background"
            .tooltip=${'Background Color'}
          >
            ${PaletteIcon()} ${EditorChevronDown}
          </editor-icon-button>
        `}
      >
        <div data-size="large" data-orientation="vertical">
          <div class="highlight-heading">Background</div>
          ${repeat(colors, color => {
            const isDefault = color === 'default';
            const value = isDefault
              ? null
              : `var(--affine-text-highlight-${color})`;
            const displayName = `${color} Background`;

            return html`
              <editor-menu-action
                data-testid="background-${color}"
                @click=${() => updateBackground(color)}
              >
                <affine-text-duotone-icon
                  style=${styleMap({
                    '--color': 'var(--affine-text-primary-color)',
                    '--background': value ?? 'transparent',
                  })}
                ></affine-text-duotone-icon>
                <span class="label capitalize">${displayName}</span>
              </editor-menu-action>
            `;
          })}
        </div>
      </editor-menu-button>
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
