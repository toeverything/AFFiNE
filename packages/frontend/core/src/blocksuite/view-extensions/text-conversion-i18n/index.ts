import { I18n } from '@affine/i18n';
import {
  updateBlockType,
} from '@blocksuite/affine-block-note';
import {
  EditorChevronDown,
} from '@blocksuite/affine-components/toolbar';
import {
  isFormatSupported,
} from '@blocksuite/affine-inline-preset';
import {
  textConversionConfigs,
} from '@blocksuite/affine-rich-text';
import {
  getBlockSelectionsCommand,
  getSelectedModelsCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import {
  BlockFlavourIdentifier,
} from '@blocksuite/affine/std';
import {
  type ToolbarActionGenerator,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

/**
 * Returns a translated label for a text conversion config type.
 * Falls back to the original English name if no translation is found.
 */
function getI18nName(type: string | undefined, originalName: string): string {
  const key = `com.affine.editor.text-type.${type ?? 'text'}` as const;
  try {
    // @ts-expect-error — dynamic key access
    const translated = I18n[key]?.();
    return translated || originalName;
  } catch {
    return originalName;
  }
}

/**
 * Overrides the built-in conversions (Text type) dropdown in the format bar
 * with translated labels, using the custom:affine:note module override pattern.
 */
const conversionsActionGroupI18n = {
  id: 'a.conversions',
  when: ({ chain }: any) => isFormatSupported(chain).run()[0],
  generate({ chain }: any) {
    const [ok, { selectedModels = [] }] = chain
      .tryAll((chain: any) => [
        chain.pipe(getTextSelectionCommand),
        chain.pipe(getBlockSelectionsCommand),
      ])
      .pipe(getSelectedModelsCommand, { types: ['text', 'block'] })
      .run();

    const allowed = ok && selectedModels.filter((model: any) => model.text).length > 0;
    if (!allowed) return null;

    const model = selectedModels[0];
    const conversion =
      textConversionConfigs.find(
        ({ flavour, type }) =>
          flavour === model.flavour &&
          (type ? 'type' in model.props && type === model.props.type : true)
      ) ?? textConversionConfigs[0];

    const update = (flavour: string, type?: string) => {
      chain
        .pipe(updateBlockType, {
          flavour,
          ...(type && { props: { type } }),
        })
        .run();
    };

    return {
      content: html`
        <editor-menu-button
          .contentPadding="${'8px'}"
          .button=${html`
            <editor-icon-button
              aria-label="Conversions"
              .tooltip="${I18n['com.affine.editor.text-type.turn-into']()}"
            >
              ${conversion.icon} ${EditorChevronDown}
            </editor-icon-button>
          `}
        >
          <div data-size="large" data-orientation="vertical">
            ${repeat(
              textConversionConfigs.filter(c => c.flavour !== 'affine:divider'),
              item => item.name,
              ({ flavour, type, name, icon }) => html`
                <editor-menu-action
                  aria-label=${getI18nName(type, name)}
                  ?data-selected=${conversion.name === name}
                  @click=${() => update(flavour, type)}
                >
                  ${icon}<span class="label">${getI18nName(type, name)}</span>
                </editor-menu-action>
              `
            )}
          </div>
        </editor-menu-button>
      `,
    };
  },
} as const satisfies ToolbarActionGenerator;

export const TextConversionI18nExtension = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('custom:affine:note'),
  config: {
    actions: [conversionsActionGroupI18n],
  },
});
