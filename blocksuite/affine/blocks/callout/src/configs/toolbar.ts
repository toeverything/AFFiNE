import {
  createPopup,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { EditorChevronDown } from '@blocksuite/affine-components/toolbar';
import { CalloutBlockModel } from '@blocksuite/affine-model';
import {
  ActionPlacement,
  type IconData,
  IconPickerServiceIdentifier,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { DeleteIcon, PaletteIcon, SmileIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { IconPickerWrapper } from '../icon-picker-wrapper.js';

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
      ctx.store.updateBlock(model, { backgroundColorName: color });
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

const iconPickerAction = {
  id: 'icon-picker',
  label: 'Icon Picker',
  tooltip: 'Change icon',
  icon: SmileIcon(),
  run() {
    // This will be handled by the content function
  },
  content(ctx) {
    const model = ctx.getCurrentModelByType(CalloutBlockModel);
    if (!model) return null;

    const handleIconPickerClick = (event: MouseEvent) => {
      // Get IconPickerService from the framework
      const iconPickerService = ctx.std.getOptional(
        IconPickerServiceIdentifier
      );
      if (!iconPickerService) {
        console.warn('IconPickerService not found');
        return;
      }

      // Get the uni-component from the service
      const iconPickerComponent = iconPickerService.iconPickerComponent;

      // Create props for the icon picker
      const props = {
        onSelect: (iconData?: IconData) => {
          // When iconData is undefined (delete icon), set icon to undefined
          ctx.store.updateBlock(model, { icon: iconData });
          closeHandler(); // Close the picker after selection
        },
        onClose: () => {
          closeHandler();
        },
      };

      // Create IconPickerWrapper instance
      const wrapper = new IconPickerWrapper();
      wrapper.iconPickerComponent = iconPickerComponent;
      wrapper.props = props;
      wrapper.style.position = 'absolute';
      wrapper.style.backgroundColor = cssVarV2.layer.background.overlayPanel;
      wrapper.style.boxShadow = 'var(--affine-menu-shadow)';
      wrapper.style.borderRadius = '8px';

      // Create popup target from the clicked element
      const target = popupTargetFromElement(event.currentTarget as HTMLElement);

      // Create popup
      const closeHandler = createPopup(target, wrapper, {
        onClose: () => {
          // Cleanup if needed
        },
      });
    };

    return html`
      <editor-icon-button
        aria-label="icon-picker"
        .tooltip=${'Change Icon'}
        @click=${handleIconPickerClick}
      >
        ${SmileIcon()} ${EditorChevronDown}
      </editor-icon-button>
    `;
  },
} satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    {
      id: 'style',
      actions: [backgroundColorAction],
    } satisfies ToolbarActionGroup<ToolbarAction>,
    {
      id: 'icon',
      actions: [iconPickerAction],
    } satisfies ToolbarActionGroup<ToolbarAction>,
    {
      placement: ActionPlacement.More,
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModelByType(CalloutBlockModel);
        if (!model) return;

        ctx.store.deleteBlock(model);

        // Clears
        ctx.select('note');
        ctx.reset();
      },
    } satisfies ToolbarAction,
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
