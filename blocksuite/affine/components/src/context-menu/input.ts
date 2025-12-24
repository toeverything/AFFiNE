import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { IS_MOBILE } from '@blocksuite/global/env';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, type TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { StyleInfo } from 'lit-html/directives/style-map.js';

import { MenuFocusable } from './focusable.js';
import type { Menu } from './menu.js';
import type { MenuItemRender } from './types.js';

export type MenuInputData = {
  placeholder?: string;
  initialValue?: string;
  class?: string;
  onComplete?: (value: string) => void;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  disableAutoFocus?: boolean;
};

export class MenuInput extends MenuFocusable {
  static override styles = css`
    .affine-menu-input {
      flex: 1;
      outline: none;
      border-radius: 4px;
      font-size: 14px;
      line-height: 22px;
      padding: 4px 6px;
      border: 1px solid var(--affine-border-color);
      width: 100%;
      color: ${unsafeCSSVarV2('text/primary')};
      background-color: transparent;
    }

    .affine-menu-input.focused {
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/primaryBorder')};
    }

    .affine-menu-input:focus {
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/primaryBorder')};
      box-shadow: 0px 0px 0px 2px rgba(28, 158, 228, 0.3);
    }
  `;

  private readonly onCompositionEnd = () => {
    this.data.onChange?.(this.inputRef.value);
  };

  private readonly onBlur = () => {
    this.data.onBlur?.(this.inputRef.value);
  };

  private readonly onInput = (e: InputEvent) => {
    e.stopPropagation();
    if (e.isComposing) return;
    this.data.onChange?.(this.inputRef.value);
  };

  private readonly onKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      this.complete();
      this.inputRef.blur();
      this.menu.focusTo(this);
      return;
    }
    if (e.key === 'Enter') {
      this.complete();
      this.menu.close();
      return;
    }
  };

  private readonly stopPropagation = (e: Event) => {
    e.stopPropagation();
  };

  complete() {
    this.data.onComplete?.(this.inputRef.value);
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'click', e => {
      e.stopPropagation();
    });
    this.disposables.addFromEvent(this, 'mouseenter', () => {
      this.menu.closeSubMenu();
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.inputRef.select();
      });
    });
  }

  override onPressEnter() {
    this.inputRef.focus();
  }

  protected override render(): unknown {
    const classString = classMap({
      [this.data.class ?? '']: true,
      'affine-menu-input': true,
      focused: this.isFocused$.value,
    });

    return html`<input
      @focus="${() => {
        this.menu.setFocusOnly(this);
      }}"
      @blur="${this.onBlur}"
      @input="${this.onInput}"
      placeholder="${this.data.placeholder ?? ''}"
      @keypress="${this.stopPropagation}"
      @keydown="${this.onKeydown}"
      @copy="${this.stopPropagation}"
      @paste="${this.stopPropagation}"
      @compositionend="${this.onCompositionEnd}"
      class="${classString}"
      value="${this.data.initialValue ?? ''}"
      type="text"
    />`;
  }

  @property({ attribute: false })
  accessor data!: MenuInputData;

  @query('input')
  accessor inputRef!: HTMLInputElement;
}

export class MobileMenuInput extends MenuFocusable {
  static override styles = css`
    .mobile-menu-input {
      flex: 1;
      outline: none;
      font-size: 17px;
      line-height: 22px;
      border: none;
      width: 100%;
      color: ${unsafeCSSVarV2('text/primary')};
    }
  `;

  private readonly onCompositionEnd = () => {
    this.data.onChange?.(this.inputRef.value);
  };

  private readonly onInput = (e: InputEvent) => {
    e.stopPropagation();
    if (e.isComposing) return;
    this.data.onChange?.(this.inputRef.value);
  };

  private readonly stopPropagation = (e: Event) => {
    e.stopPropagation();
  };

  complete() {
    this.data.onComplete?.(this.inputRef.value);
  }

  override onPressEnter() {
    this.inputRef.focus();
  }

  protected override render(): unknown {
    const classString = classMap({
      [this.data.class ?? '']: true,
      'mobile-menu-input': true,
      focused: this.isFocused$.value,
    });

    return html`<input
      @focus="${() => {
        this.menu.setFocusOnly(this);
      }}"
      @input="${this.onInput}"
      @copy="${this.stopPropagation}"
      @paste="${this.stopPropagation}"
      @compositionend="${this.onCompositionEnd}"
      class="${classString}"
      value="${this.data.initialValue ?? ''}"
      type="text"
    />`;
  }

  @property({ attribute: false })
  accessor data!: MenuInputData;

  @query('input')
  accessor inputRef!: HTMLInputElement;
}

const renderInput = (data: MenuInputData, menu: Menu) => {
  if (IS_MOBILE) {
    return html` <mobile-menu-input
      style="flex:1"
      .data="${data}"
      .menu="${menu}"
    ></mobile-menu-input>`;
  }
  return html` <affine-menu-input
    style="flex:1"
    .data="${data}"
    .menu="${menu}"
  ></affine-menu-input>`;
};
export const menuInputItems = {
  input:
    (config: {
      placeholder?: string;
      initialValue?: string;
      postfix?: TemplateResult;
      prefix?: TemplateResult;
      onComplete?: (value: string) => void;
      onChange?: (value: string) => void;
      onBlur?: (value: string) => void;
      class?: string;
      style?: Readonly<StyleInfo>;
    }) =>
    menu => {
      if (menu.showSearch$.value) {
        return;
      }
      const data: MenuInputData = {
        placeholder: config.placeholder,
        initialValue: config.initialValue,
        class: config.class,
        onComplete: config.onComplete,
        onChange: config.onChange,
        onBlur: config.onBlur,
      };
      const style = styleMap({
        display: 'flex',
        alignItems: 'center',
        ...(IS_MOBILE
          ? {
              borderRadius: '12px',
              backgroundColor: cssVarV2('layer/background/primary'),
              padding: '12px',
              gap: '8px',
            }
          : {
              marginBottom: '8px',
              gap: '4px',
            }),
        ...config.style,
      });
      return html`
        <div style="${style}">
          ${config.prefix} ${renderInput(data, menu)} ${config.postfix}
        </div>
      `;
    },
} satisfies Record<string, MenuItemRender<never>>;
