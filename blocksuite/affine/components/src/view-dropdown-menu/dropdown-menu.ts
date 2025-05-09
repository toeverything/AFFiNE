import {
  type ToolbarAction,
  ToolbarContext,
} from '@blocksuite/affine-shared/services';
import { SignalWatcher } from '@blocksuite/global/lit';
import { PropTypes, requiredProperties } from '@blocksuite/std';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';

import { EditorChevronDown } from '../toolbar';

@requiredProperties({
  actions: PropTypes.array,
  context: PropTypes.instanceOf(ToolbarContext),
  viewType$: PropTypes.object,
})
export class ViewDropdownMenu extends SignalWatcher(LitElement) {
  @property({ attribute: false })
  accessor actions!: ToolbarAction[];

  @property({ attribute: false })
  accessor context!: ToolbarContext;

  @property({ attribute: false })
  accessor viewType$!: Signal<string> | ReadonlySignal<string>;

  override render() {
    const {
      actions,
      context,
      viewType$: { value: viewType },
    } = this;

    return html`
      <editor-menu-button
        .contentPadding="${'8px'}"
        .button=${html`
          <editor-icon-button
            aria-label="Switch view"
            .tooltip="${'Switch view'}"
            .justify="${'space-between'}"
            .labelHeight="${'20px'}"
            .iconContainerWidth="${'110px'}"
          >
            <span class="label">${viewType}</span>
            ${EditorChevronDown}
          </editor-icon-button>
        `}
      >
        <div data-size="small" data-orientation="vertical">
          ${repeat(
            actions.filter(action => {
              if (typeof action.when === 'function')
                return action.when(context);
              return action.when ?? true;
            }),
            action => action.id,
            ({ id, label, disabled, run }) => html`
              <editor-menu-action
                aria-label="${ifDefined(label)}"
                data-testid="${`link-to-${id}`}"
                ?data-selected="${label === viewType}"
                ?disabled="${ifDefined(
                  typeof disabled === 'function' ? disabled(context) : disabled
                )}"
                @click=${() => run?.(context)}
              >
                ${label}
              </editor-menu-action>
            `
          )}
        </div>
      </editor-menu-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-view-dropdown-menu': ViewDropdownMenu;
  }
}
