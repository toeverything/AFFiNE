import { PANEL_BASE } from '@blocksuite/affine-shared/styles';
import {
  type ButtonPopperOptions,
  createButtonPopper,
} from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  css,
  html,
  LitElement,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { property, query } from 'lit/decorators.js';

import type { EditorIconButton } from './icon-button.js';

export class EditorMenuButton extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
  `;

  private _popper!: ReturnType<typeof createButtonPopper>;

  override firstUpdated() {
    this._popper = createButtonPopper({
      reference: this._trigger,
      popperElement: this._content,
      stateUpdated: ({ display }) => {
        const opened = display === 'show';
        this._trigger.showTooltip = !opened;
        this.dispatchEvent(
          new CustomEvent('toggle', {
            detail: opened,
            bubbles: false,
            cancelable: false,
            composed: true,
          })
        );
      },
      mainAxis: 12,
      ignoreShift: true,
      offsetHeight: 6 * 4,
      ...this.popperOptions,
    });
    this._disposables.addFromEvent(this, 'keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this._popper.hide();
      }
    });
    this._disposables.addFromEvent(this._trigger, 'click', (_: MouseEvent) => {
      this._popper.toggle();
    });
    this._disposables.add(this._popper);
  }

  hide() {
    this._popper?.hide();
  }

  override render() {
    return html`
      ${this.button}
      <editor-menu-content role="menu" tabindex="-1">
        <slot></slot>
      </editor-menu-content>
    `;
  }

  show(force = false) {
    this._popper?.show(force);
  }

  override willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('contentPadding')) {
      this.style.setProperty('--content-padding', this.contentPadding ?? '');
    }
  }

  @query('editor-menu-content')
  private accessor _content!: EditorMenuContent;

  @query('editor-icon-button')
  private accessor _trigger!: EditorIconButton;

  @property({ attribute: false })
  accessor button!: TemplateResult;

  @property({ attribute: false })
  accessor contentPadding: string | undefined = undefined;

  @property({ attribute: false })
  accessor popperOptions: Partial<ButtonPopperOptions> = {};
}

export class EditorMenuContent extends LitElement {
  static override styles = css`
    :host {
      display: none;
      outline: none;
      overscroll-behavior: contain;
      overflow-y: auto;
    }

    :host([data-show]) {
      ${PANEL_BASE};
      justify-content: center;
      padding: var(--content-padding, 0 6px);
    }

    ::slotted(:not(.custom)) {
      display: flex;
      align-items: center;
      align-self: stretch;
      gap: 8px;
      min-height: 36px;
    }

    ::slotted([data-size]) {
      min-width: 146px;
    }

    ::slotted([data-size='small']) {
      min-width: 164px;
    }

    ::slotted([data-size='large']) {
      min-width: 176px;
    }

    ::slotted([data-orientation='vertical']) {
      flex-direction: column;
      align-items: stretch;
      gap: unset;
      min-height: fit-content;
    }
  `;

  override render() {
    return html`<slot></slot>`;
  }
}

export class EditorMenuAction extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      width: 100%;
      align-items: center;
      white-space: nowrap;
      box-sizing: border-box;
      padding: 4px 8px;
      border-radius: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      gap: 8px;
      color: var(--affine-text-primary-color);
      font-weight: 400;
      min-height: 30px; // 22 + 8
    }

    :host(:hover),
    :host([data-selected]) {
      background-color: var(--affine-hover-color);
    }

    :host([data-selected]) {
      pointer-events: none;
    }

    :host(:hover.delete),
    :host(:hover.delete) ::slotted(svg) {
      background-color: var(--affine-background-error-color);
      color: var(--affine-error-color);
    }

    :host([disabled]) {
      pointer-events: none;
      cursor: not-allowed;
      color: var(--affine-text-disable-color);
    }

    ::slotted(svg) {
      color: var(--affine-icon-color);
      font-size: 20px;
    }

    ::slotted(.label) {
      color: inherit !important;
    }
    ::slotted(.label.capitalize) {
      text-transform: capitalize !important;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.role = 'button';
  }

  override render() {
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'editor-menu-button': EditorMenuButton;
    'editor-menu-content': EditorMenuContent;
    'editor-menu-action': EditorMenuAction;
  }
}
