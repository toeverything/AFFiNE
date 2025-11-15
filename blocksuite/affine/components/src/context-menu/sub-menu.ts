import { IS_MOBILE } from '@blocksuite/global/env';
import { ArrowRightSmallIcon } from '@blocksuite/icons/lit';
import {
  autoPlacement,
  autoUpdate,
  computePosition,
  offset,
} from '@floating-ui/dom';
import { html, nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { MenuFocusable } from './focusable.js';
import { Menu, type MenuOptions } from './menu.js';
import { popMenu, popupTargetFromElement } from './menu-renderer.js';
import type { MenuItemRender } from './types.js';

export type MenuSubMenuData = {
  content: () => TemplateResult;
  options: MenuOptions;
  select?: () => void;
  class?: string;
};
export const subMenuOffset = offset({
  mainAxis: 16,
  crossAxis: -8.5,
});
export const subMenuPlacements = autoPlacement({
  allowedPlacements: ['right-start', 'left-start', 'right-end', 'left-end'],
});
export const subMenuMiddleware = [subMenuOffset, subMenuPlacements];

export class MenuSubMenu extends MenuFocusable {
  createTime = 0;

  override connectedCallback() {
    super.connectedCallback();
    this.createTime = Date.now();
    this.disposables.addFromEvent(this, 'mouseenter', this.onMouseEnter);
    this.disposables.addFromEvent(this, 'click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (this.data.select) {
        this.data.select();
        this.menu.close();
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
    const focus = this.menu.currentFocused$.value;
    const menu = new Menu({
      ...this.data.options,
      onComplete: () => {
        this.menu.close();
      },
      onClose: () => {
        menu.menuElement.remove();
        this.menu.focusTo(focus);
        this.data.options.onClose?.();
        unsub();
      },
    });
    this.menu.menuElement.parentElement?.append(menu.menuElement);
    const unsub = autoUpdate(this, menu.menuElement, () => {
      computePosition(this, menu.menuElement, {
        middleware: subMenuMiddleware,
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
          this.menu.close();
        },
        onClose: () => {
          menu.menuElement.remove();
          this.data.options.onClose?.();
        },
      },
    });
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
      };
      return renderSubMenu(data, menu);
    },
} satisfies Record<string, MenuItemRender<never>>;
