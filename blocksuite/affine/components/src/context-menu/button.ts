import { IS_MOBILE } from '@blocksuite/global/env';
import {
  CheckBoxCheckSolidIcon,
  CheckBoxUnIcon,
  DoneIcon,
} from '@blocksuite/icons/lit';
import type { ReadonlySignal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, type TemplateResult, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { keyed } from 'lit/directives/keyed.js';
import type { ClassInfo } from 'lit-html/directives/class-map.js';

import { MenuFocusable } from './focusable.js';
import type { Menu } from './menu.js';
import type { MenuClass, MenuItemRender } from './types.js';

export type MenuButtonData = {
  content: () => TemplateResult;
  class: ClassInfo;
  select: (ele: HTMLElement) => void | false;
  onHover?: (hover: boolean) => void;
};

export class MenuButton extends MenuFocusable {
  static override styles = css`
    .affine-menu-button {
      display: flex;
      width: 100%;
      font-size: 20px;
      cursor: pointer;
      align-items: center;
      padding: 4px;
      gap: 8px;
      border-radius: 4px;
      color: var(--affine-icon-color);
    }

    .affine-menu-button.affine-menu-action-disabled {
      opacity: 0.5;
      pointer-events: none;
      cursor: not-allowed;
    }

    .affine-menu-button:hover,
    affine-menu-button.active .affine-menu-button {
      background-color: var(--affine-hover-color);
    }

    .affine-menu-button .affine-menu-action-text {
      flex: 1;
      font-size: 14px;
      line-height: 22px;
      color: var(--affine-text-primary-color);
    }

    .affine-menu-button.focused {
      outline: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.primaryBorder)};
    }

    .affine-menu-button.delete-item:hover {
      background-color: var(--affine-background-error-color);
      color: var(--affine-error-color);
    }

    .affine-menu-button.delete-item:hover .affine-menu-action-text {
      color: var(--affine-error-color);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'mouseenter', () => {
      this.data.onHover?.(true);
      this.menu.closeSubMenu();
    });
    this.disposables.addFromEvent(this, 'mouseleave', () => {
      this.data.onHover?.(false);
    });
    this.disposables.addFromEvent(this, 'click', this.onClick);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.data.onHover?.(false);
  }

  onClick() {
    if (this.data.select(this) !== false) {
      this.menu.options.onComplete?.();
      this.menu.close();
    }
  }

  override onPressEnter() {
    this.onClick();
  }

  protected override render(): unknown {
    const classString = classMap({
      'affine-menu-button': true,
      focused: this.isFocused$.value,
      ...this.data.class,
    });
    return html` <div class="${classString}">${this.data.content()}</div>`;
  }

  @property({ attribute: false })
  accessor data!: MenuButtonData;
}

export class MobileMenuButton extends MenuFocusable {
  static override styles = css`
    .mobile-menu-button {
      display: flex;
      width: 100%;
      cursor: pointer;
      align-items: center;
      font-size: 20px;
      padding: 11px 8px;
      gap: 8px;
      border-radius: 4px;
      color: var(--affine-icon-color);
    }

    .mobile-menu-button .affine-menu-action-text {
      flex: 1;
      color: var(--affine-text-primary-color);
      font-size: 17px;
      line-height: 22px;
    }

    .mobile-menu-button.delete-item {
      color: var(--affine-error-color);
    }

    .mobile-menu-button.delete-item .mobile-menu-action-text {
      color: var(--affine-error-color);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'click', this.onClick);
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  onClick() {
    if (this.data.select(this) !== false) {
      this.menu.options.onComplete?.();
      this.menu.close();
    }
  }

  override onPressEnter() {
    this.onClick();
  }

  protected override render(): unknown {
    const classString = classMap({
      'mobile-menu-button': true,
      focused: this.isFocused$.value,
      ...this.data.class,
    });
    return html` <div class="${classString}">${this.data.content()}</div>`;
  }

  @property({ attribute: false })
  accessor data!: MenuButtonData;
}

const renderButton = (data: MenuButtonData, menu: Menu) => {
  if (IS_MOBILE) {
    return html`<mobile-menu-button
      .data="${data}"
      .menu="${menu}"
    ></mobile-menu-button>`;
  }
  return html`<affine-menu-button
    .data="${data}"
    .menu="${menu}"
  ></affine-menu-button>`;
};
export const menuButtonItems = {
  action:
    (config: {
      name: string;
      label?: () => TemplateResult;
      prefix?: TemplateResult;
      postfix?: TemplateResult;
      isSelected?: boolean;
      select: (ele: HTMLElement) => void | false;
      onHover?: (hover: boolean) => void;
      class?: MenuClass;
      hide?: () => boolean;
    }) =>
    menu => {
      if (config.hide?.() || !menu.search(config.name)) {
        return;
      }
      const data: MenuButtonData = {
        content: () => {
          return html`
            ${config.prefix}
            <div class="affine-menu-action-text">
              ${config.label?.() ?? config.name}
            </div>
            ${config.postfix ?? (config.isSelected ? DoneIcon() : undefined)}
          `;
        },
        onHover: config.onHover,
        select: config.select,
        class: {
          'selected-item': config.isSelected ?? false,
          ...config.class,
        },
      };
      return renderButton(data, menu);
    },
  checkbox:
    (config: {
      name: string;
      checked: ReadonlySignal<boolean>;
      postfix?: TemplateResult;
      label?: () => TemplateResult;
      select: (checked: boolean) => boolean;
      class?: ClassInfo;
    }) =>
    menu => {
      if (!menu.search(config.name)) {
        return;
      }
      const data: MenuButtonData = {
        content: () => html`
          ${config.checked.value
            ? CheckBoxCheckSolidIcon({ style: `color:#1E96EB` })
            : CheckBoxUnIcon()}
          <div class="affine-menu-action-text">
            ${config.label?.() ?? config.name}
          </div>
          ${config.postfix}
        `,
        select: () => {
          config.select(config.checked.value);
          return false;
        },
        class: config.class ?? {},
      };
      return html`${keyed(config.name, renderButton(data, menu))}`;
    },
  toggleSwitch:
    (config: {
      name: string;
      on: boolean;
      postfix?: TemplateResult;
      label?: () => TemplateResult;
      onChange: (on: boolean) => void;
      class?: ClassInfo;
    }) =>
    menu => {
      if (!menu.search(config.name)) {
        return;
      }
      const onChange = (on: boolean) => {
        config.onChange(on);
      };

      const data: MenuButtonData = {
        content: () => html`
          <div class="affine-menu-action-text">
            ${config.label?.() ?? config.name}
          </div>
          <toggle-switch
            .on="${config.on}"
            .onChange="${onChange}"
          ></toggle-switch>
          ${config.postfix}
        `,
        select: () => {
          config.onChange(config.on);
          return false;
        },
        class: config.class ?? {},
      };
      return html`${keyed(config.name, renderButton(data, menu))}`;
    },
} satisfies Record<string, MenuItemRender<never>>;
