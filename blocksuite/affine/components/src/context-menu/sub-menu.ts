import { IS_MOBILE } from '@blocksuite/global/env';
import { ArrowRightSmallIcon } from '@blocksuite/icons/lit';
import {
  autoPlacement,
  autoUpdate,
  computePosition,
  type Middleware,
  offset,
  shift,
} from '@floating-ui/dom';
import { css, html, nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { MenuButton } from './button.js';
import { MenuFocusable } from './focusable.js';
import { Menu, type MenuOptions } from './menu.js';
import { popMenu, popupTargetFromElement } from './menu-renderer.js';
import type { MenuItemRender } from './types.js';

export type MenuSubMenuData = {
  content: () => TemplateResult;
  options: MenuOptions;
  select?: () => void;
  class?: string;
  openOnHover?: boolean;
  middleware?: Middleware[];
  autoHeight?: boolean;
  closeOnSelect?: boolean;
};
export const subMenuOffset = offset({
  mainAxis: 16,
  crossAxis: 0,
});
export const subMenuPlacements = autoPlacement({
  allowedPlacements: ['bottom-end'],
});
export const subMenuMiddleware = [subMenuOffset, subMenuPlacements];

export const dropdownSubMenuMiddleware = [
  autoPlacement({ allowedPlacements: ['bottom-end'] }),
  offset({ mainAxis: 8, crossAxis: 0 }),
  shift({ crossAxis: true }),
];

export class MenuSubMenu extends MenuFocusable {
  static override styles = [
    MenuButton.styles,
    css`
      .affine-menu-button svg:last-child {
        transition: transform 150ms cubic-bezier(0.42, 0, 1, 1);
      }
      affine-menu-sub-menu.active .affine-menu-button svg:last-child {
        transform: rotate(90deg);
      }
    `,
  ];

  createTime = 0;

  override connectedCallback() {
    super.connectedCallback();
    this.createTime = Date.now();
    if (this.data.openOnHover !== false) {
      this.disposables.addFromEvent(this, 'mouseenter', this.onMouseEnter);
    }
    this.disposables.addFromEvent(this, 'click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (this.data.select) {
        this.data.select();
        if (this.data.closeOnSelect !== false) {
          this.menu.close();
        }
      } else {
        this.openSubMenu();
      }
    });
  }

  onMouseEnter() {
    if (Date.now() - this.createTime > 100) {
      this.openSubMenu();
    }
  }

  override onPressEnter() {
    this.onMouseEnter();
  }

  openSubMenu() {
    if (this.data.openOnHover === false) {
      const { menu } = popMenu(popupTargetFromElement(this), {
        options: {
          ...this.data.options,
          onComplete: () => {
            if (this.data.closeOnSelect !== false) {
              this.menu.close();
            }
          },
          onClose: () => {
            menu.menuElement.remove();
            this.data.options.onClose?.();
          },
        },
        middleware: this.data.middleware,
      });
      if (this.data.autoHeight) {
        menu.menuElement.style.minHeight = 'fit-content';
        menu.menuElement.style.maxHeight = 'fit-content';
      }
      menu.menuElement.style.minWidth = '200px';
      this.menu.openSubMenu(menu);
      return;
    }

    const focus = this.menu.currentFocused$.value;
    const menu = new Menu({
      ...this.data.options,
      onComplete: () => {
        if (this.data.closeOnSelect !== false) {
          this.menu.close();
        }
      },
      onClose: () => {
        menu.menuElement.remove();
        this.menu.focusTo(focus);
        this.data.options.onClose?.();
        unsub();
      },
    });
    this.menu.menuElement.parentElement?.append(menu.menuElement);
    if (this.data.autoHeight) {
      menu.menuElement.style.minHeight = 'fit-content';
      menu.menuElement.style.maxHeight = 'fit-content';
    }
    menu.menuElement.style.minWidth = '200px';
    const unsub = autoUpdate(this, menu.menuElement, () => {
      computePosition(this, menu.menuElement, {
        middleware: this.data.middleware ?? subMenuMiddleware,
      })
        .then(({ x, y }) => {
          menu.menuElement.style.left = `${x}px`;
          menu.menuElement.style.top = `${y}px`;
        })
        .catch(err => console.error(err));
    });
    this.menu.openSubMenu(menu);
    // in case that the menu is not closed, but the component is removed,
    this.disposables.add(unsub);
  }

  protected override render(): unknown {
    const classString = classMap({
      [this.data.class ?? '']: true,
      'affine-menu-button': true,
      focused: this.isFocused$.value,
    });
    return html` <div class="${classString}">${this.data.content()}</div>`;
  }

  @property({ attribute: false })
  accessor data!: MenuSubMenuData;
}

export class MobileSubMenu extends MenuFocusable {
  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'click', e => {
      e.preventDefault();
      e.stopPropagation();
      this.openSubMenu();
    });
  }

  onMouseEnter() {
    this.openSubMenu();
  }

  override onPressEnter() {
    this.onMouseEnter();
  }

  openSubMenu() {
    const { menu } = popMenu(popupTargetFromElement(this), {
      options: {
        ...this.data.options,
        onComplete: () => {
          if (this.data.closeOnSelect !== false) {
            this.menu.close();
          }
        },
        onClose: () => {
          menu.menuElement.remove();
          this.data.options.onClose?.();
        },
      },
      middleware: this.data.middleware,
    });
    if (this.data.autoHeight) {
      menu.menuElement.style.minHeight = 'fit-content';
      menu.menuElement.style.maxHeight = 'fit-content';
    }
    menu.menuElement.style.minWidth = '200px';
    this.menu.openSubMenu(menu);
  }

  protected override render(): unknown {
    const classString = classMap({
      [this.data.class ?? '']: true,
      'mobile-menu-button': true,
      focused: this.isFocused$.value,
    });
    return html` <div class="${classString}">${this.data.content()}</div>`;
  }

  @property({ attribute: false })
  accessor data!: MenuSubMenuData;
}

export const renderSubMenu = (data: MenuSubMenuData, menu: Menu) => {
  if (IS_MOBILE) {
    return html` <mobile-sub-menu
      .data="${data}"
      .menu="${menu}"
    ></mobile-sub-menu>`;
  }
  return html` <affine-menu-sub-menu
    .data="${data}"
    .menu="${menu}"
  ></affine-menu-sub-menu>`;
};

export const subMenuItems = {
  subMenu:
    (config: {
      name: string;
      label?: () => TemplateResult;
      select?: () => void;
      isSelected?: boolean;
      postfix?: TemplateResult;
      prefix?: TemplateResult;
      class?: string;
      options: MenuOptions;
      disableArrow?: boolean;
      hide?: () => boolean;
      openOnHover?: boolean;
      middleware?: Middleware[];
      autoHeight?: boolean;
      closeOnSelect?: boolean;
    }) =>
    menu => {
      if (config.hide?.() || !menu.search(config.name)) {
        return;
      }
      const data: MenuSubMenuData = {
        content: () =>
          html`${config.prefix}
            <div class="affine-menu-action-text">
              ${config.label?.() ?? config.name}
            </div>
            ${config.postfix}
            ${config.disableArrow ? nothing : ArrowRightSmallIcon()} `,
        class: config.class,
        options: config.options,
        openOnHover: config.openOnHover,
        middleware: config.middleware,
        autoHeight: config.autoHeight,
        closeOnSelect: config.closeOnSelect,
      };
      return renderSubMenu(data, menu);
    },
} satisfies Record<string, MenuItemRender<never>>;
