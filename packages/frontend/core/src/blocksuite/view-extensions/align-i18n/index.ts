import { I18n } from '@affine/i18n';
import {
  updateBlockAlign,
} from '@blocksuite/affine-block-note';
import {
  EditorChevronDown,
} from '@blocksuite/affine-components/toolbar';
import {
  isFormatSupported,
  textAlignConfigs,
} from '@blocksuite/affine-rich-text';
import type { TextAlign } from '@blocksuite/affine-model';
import {
  getBlockSelectionsCommand,
  getSelectedModelsCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import {
  BlockFlavourIdentifier,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getMostCommonValue } from '@blocksuite/affine-shared/utils';
import {
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from '@blocksuite/icons/lit';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

/**
 * Translates the "Align" dropdown in the format bar using AFFiNE's i18n system.
 *
 * Uses the custom:<flavour> ToolbarModuleExtension override pattern to inject
 * translated labels into the `b.align` action group without modifying blocksuite.
 */

const alignI18nConfigs = [
  {
    textAlign: 'left' as TextAlign,
    icon: TextAlignLeftIcon(),
    label: () => I18n['com.affine.editor.align.left'](),
  },
  {
    textAlign: 'center' as TextAlign,
    icon: TextAlignCenterIcon(),
    label: () => I18n['com.affine.editor.align.center'](),
  },
  {
    textAlign: 'right' as TextAlign,
    icon: TextAlignRightIcon(),
    label: () => I18n['com.affine.editor.align.right'](),
  },
];

export const AlignI18nExtension = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('custom:affine:note'),
  config: {
    actions: [
      {
        id: 'b.align',
        when: ({ chain }) => isFormatSupported(chain).run()[0],
        generate({ chain }) {
          const [ok, { selectedModels = [] }] = chain
            .tryAll(chain => [
              chain.pipe(getTextSelectionCommand),
              chain.pipe(getBlockSelectionsCommand),
            ])
            .pipe(getSelectedModelsCommand, { types: ['text', 'block'] })
            .run();

          if (!ok) return null;

          const currentAlign = getMostCommonValue(
            selectedModels.map(({ props }) => props as { textAlign?: TextAlign }),
            'textAlign'
          );

          const current =
            alignI18nConfigs.find(c => c.textAlign === currentAlign) ??
            alignI18nConfigs[0];

          const update = (textAlign: TextAlign) => {
            chain.pipe(updateBlockAlign, { textAlign }).run();
          };

          return {
            content: html`
              <editor-menu-button
                .contentPadding="${'8px'}"
                .button=${html`
                  <editor-icon-button
                    aria-label="Align"
                    .tooltip="${I18n['com.affine.editor.align.tooltip']()}"
                  >
                    ${current.icon} ${EditorChevronDown}
                  </editor-icon-button>
                `}
              >
                <div data-size="large" data-orientation="vertical">
                  ${repeat(
                    alignI18nConfigs,
                    c => c.textAlign,
                    ({ textAlign, icon, label }) => html`
                      <editor-menu-action
                        aria-label=${label()}
                        ?data-selected=${current.textAlign === textAlign}
                        @click=${() => update(textAlign)}
                      >
                        ${icon}<span class="label">${label()}</span>
                      </editor-menu-action>
                    `
                  )}
                </div>
              </editor-menu-button>
            `,
          };
        },
      },
    ],
  },
});
