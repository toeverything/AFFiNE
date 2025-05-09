import type { ColorScheme } from '@blocksuite/affine-model';
import {
  type ToolbarAction,
  ToolbarContext,
} from '@blocksuite/affine-shared/services';
import { SignalWatcher } from '@blocksuite/global/lit';
import { PaletteIcon } from '@blocksuite/icons/lit';
import { PropTypes, requiredProperties } from '@blocksuite/std';
import {
  computed,
  type ReadonlySignal,
  type Signal,
} from '@preact/signals-core';
import { LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { html, type TemplateResult } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';

import {
  EmbedCardDarkCubeIcon,
  EmbedCardDarkHorizontalIcon,
  EmbedCardDarkListIcon,
  EmbedCardDarkVerticalIcon,
  EmbedCardLightCubeIcon,
  EmbedCardLightHorizontalIcon,
  EmbedCardLightListIcon,
  EmbedCardLightVerticalIcon,
} from '../icons';

const cardStyleMap: Record<ColorScheme, Record<string, TemplateResult>> = {
  light: {
    cube: EmbedCardLightCubeIcon,
    cubeThick: EmbedCardLightCubeIcon,
    horizontal: EmbedCardLightHorizontalIcon,
    horizontalThin: EmbedCardLightListIcon,
    list: EmbedCardLightListIcon,
    vertical: EmbedCardLightVerticalIcon,
  },
  dark: {
    cube: EmbedCardDarkCubeIcon,
    cubeThick: EmbedCardDarkCubeIcon,
    horizontal: EmbedCardDarkHorizontalIcon,
    horizontalThin: EmbedCardDarkListIcon,
    list: EmbedCardDarkListIcon,
    vertical: EmbedCardDarkVerticalIcon,
  },
};

@requiredProperties({
  actions: PropTypes.array,
  context: PropTypes.instanceOf(ToolbarContext),
  style$: PropTypes.object,
})
export class CardStyleDropdownMenu extends SignalWatcher(LitElement) {
  @property({ attribute: false })
  accessor actions!: ToolbarAction[];

  @property({ attribute: false })
  accessor context!: ToolbarContext;

  @property({ attribute: false })
  accessor style$!: Signal<string> | ReadonlySignal<string>;

  icons$ = computed(() => cardStyleMap[this.context.theme.theme$.value]);

  override render() {
    const {
      actions,
      context,
      style$: { value: style },
      icons$: { value: icons },
    } = this;

    return html`
      <editor-menu-button
        .contentPadding="${'8px'}"
        .button=${html`
          <editor-icon-button
            aria-label="Card style"
            .tooltip="${'Card style'}"
          >
            ${PaletteIcon()}
          </editor-icon-button>
        `}
      >
        <div>
          ${repeat(
            actions,
            action => action.id,
            ({ id, label, icon, disabled, run }) => html`
              <editor-icon-button
                aria-label="${ifDefined(label)}"
                data-testid="${id}"
                .tooltip="${label}"
                .activeMode="${'border'}"
                .iconContainerWidth="${'76px'}"
                .iconContainerHeight="${'76px'}"
                .justify="${'center'}"
                ?active="${id === style}"
                ?disabled="${ifDefined(disabled)}"
                @click=${() => run?.(context)}
              >
                ${icon || icons[id]}
              </editor-icon-button>
            `
          )}
        </div>
      </editor-menu-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-card-style-dropdown-menu': CardStyleDropdownMenu;
  }
}
