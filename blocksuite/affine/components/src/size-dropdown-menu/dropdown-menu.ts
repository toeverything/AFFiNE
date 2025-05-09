import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { DoneIcon } from '@blocksuite/icons/lit';
import { PropTypes, requiredProperties } from '@blocksuite/std';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { css, html, LitElement, type TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { when } from 'lit-html/directives/when.js';
import clamp from 'lodash-es/clamp';

import { EditorChevronDown, type EditorMenuButton } from '../toolbar';

type SizeItem = { key?: string | number; value: number };

const MIN_SIZE = 0;
const MAX_SIZE = 400;
const SIZE_LIST: SizeItem[] = [
  { value: 50 },
  { value: 100 },
  { value: 200 },
] as const;

@requiredProperties({
  size$: PropTypes.object,
})
export class SizeDropdownMenu extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = css`
    div[data-orientation] {
      width: 68px;
      gap: 4px;
      min-width: unset;
      overflow: unset;
    }

    editor-menu-action {
      justify-content: space-between;
      color: var(--affine-icon-color);
    }

    :host([data-type='check']) editor-menu-action[data-selected] {
      color: var(--affine-primary-color);
      background-color: unset;
    }

    input {
      display: flex;
      align-self: stretch;
      border: 0.5px solid var(--affine-border-color);
      border-radius: 8px;
      padding: 4px 8px;
      box-sizing: border-box;
    }

    input:focus {
      outline-color: var(--affine-primary-color);
      outline-width: 0.5px;
    }

    input::placeholder {
      color: var(--affine-placeholder-color);
    }
  `;

  @property({ attribute: false })
  accessor sizes: readonly SizeItem[] = SIZE_LIST;

  @property({ attribute: false })
  accessor size$!: Signal<number> | ReadonlySignal<number>;

  @property({ attribute: false })
  accessor maxSize: number = MAX_SIZE;

  @property({ attribute: false })
  accessor minSize: number = MIN_SIZE;

  @property({ attribute: false })
  accessor format: ((e: number) => string) | undefined;

  @property({ attribute: false })
  accessor label: string = 'Scale';

  @property({ attribute: false })
  accessor icon: TemplateResult | undefined;

  @property({ attribute: 'data-type' })
  accessor type: 'normal' | 'check' = 'normal';

  clamp(value: number, min = this.minSize, max = this.maxSize) {
    return clamp(value, min, max);
  }

  select(value: number) {
    const detail = this.clamp(value);
    this.dispatchEvent(new CustomEvent('select', { detail }));
  }

  private readonly _onKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();

    if (e.isComposing) return;
    if (e.key !== 'Enter') return;

    e.preventDefault();
    const input = e.target as HTMLInputElement;
    const value = parseInt(input.value.trim());
    // Handle edge case where user enters a non-number
    if (isNaN(value)) {
      input.value = '';
      return;
    }

    // Handle edge case when user enters a number that is out of range
    this.select(value);
    input.value = '';

    this.menuButton.hide();
  };

  @query('input')
  accessor input!: HTMLInputElement;

  @query('editor-menu-button')
  accessor menuButton!: EditorMenuButton;

  override firstUpdated() {
    this.disposables.addFromEvent(
      this.menuButton,
      'toggle',
      (e: CustomEvent<boolean>) => {
        const opened = e.detail;
        if (opened) return;
        this.input.value = '';
      }
    );
  }

  override render() {
    const {
      sizes,
      format,
      type,
      icon,
      label,
      size$: { value: size },
    } = this;
    const isCheckType = type === 'check';
    const placeholder = format?.(Math.trunc(size)) ?? Math.trunc(size);

    return html`
      <editor-menu-button
        class="${`${label.toLowerCase()}-menu`}"
        .contentPadding="${'8px'}"
        .button=${html`
          <editor-icon-button
            aria-label="${label}"
            .tooltip="${label}"
            .justify="${'space-between'}"
            .labelHeight="${'20px'}"
            .iconContainerWidth="${icon ? 'unset' : '65px'}"
          >
            ${icon ??
            html`<span class="label">${format?.(size) ?? size}</span>`}
            ${EditorChevronDown}
          </editor-icon-button>
        `}
      >
        <div data-orientation="vertical">
          ${repeat(
            sizes,
            ({ key, value }) => key ?? value,
            ({ key, value }) => html`
              <editor-menu-action
                aria-label="${key ?? value}"
                ?data-selected="${size === value}"
                @click=${() => this.select(value)}
              >
                ${key ?? format?.(value) ?? value}
                ${when(isCheckType && size === value, () => DoneIcon())}
              </editor-menu-action>
            `
          )}

          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            min="${this.minSize}"
            max="${this.maxSize}"
            placeholder="${placeholder}"
            @keydown=${this._onKeydown}
            @input=${stopPropagation}
            @click=${stopPropagation}
            @pointerdown=${stopPropagation}
            @cut=${stopPropagation}
            @copy=${stopPropagation}
            @paste=${stopPropagation}
          />
        </div>
      </editor-menu-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-size-dropdown-menu': SizeDropdownMenu;
  }
}
