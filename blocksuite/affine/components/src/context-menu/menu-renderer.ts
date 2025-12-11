import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { IS_MOBILE } from '@blocksuite/global/env';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  ArrowLeftBigIcon,
  ArrowLeftSmallIcon,
  CloseIcon,
  SearchIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import {
  autoPlacement,
  autoUpdate,
  computePosition,
  type Middleware,
  offset,
  type Placement,
  type ReferenceElement,
  shift,
} from '@floating-ui/dom';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { MenuFocusable } from './focusable.js';
import { Menu, type MenuConfig, type MenuOptions } from './menu.js';
import type { MenuComponentInterface } from './types.js';

export class MenuComponent
  extends SignalWatcher(WithDisposable(ShadowlessElement))
  implements MenuComponentInterface
{
  static override styles = css`
    affine-menu {
      font-family: var(--affine-font-family);
      display: flex;
      flex-direction: column;
      user-select: none;
      min-width: 320px;
      max-width: 320px;
      max-height: 700px;
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
      border-radius: 4px;
      background-color: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      padding: 8px;
      position: absolute;
      z-index: 999;
      gap: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .affine-menu-search-container {
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding: 4px 10px;
      gap: 8px;
      border: 1px solid ${unsafeCSSVarV2('input/border/default')};
    }

    .affine-menu-search {
      flex: 1;
      outline: none;
      font-size: 14px;
      line-height: 22px;
      border: none;
      background-color: transparent;
    }

    .affine-menu-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .no-results {
      font-size: 12px;
      line-height: 20px;
      color: var(--affine-text-secondary-color);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 8px;
    }
  `;

  private readonly _clickContainer = (e: MouseEvent) => {
    e.stopPropagation();
    this.focusInput();
    this.menu.closeSubMenu();
  };

  private readonly searchRef = createRef<HTMLInputElement>();

  override firstUpdated() {
    const input = this.searchRef.value;
    if (input) {
      requestAnimationFrame(() => {
        this.focusInput();
      });
      const length = input.value.length;
      input.setSelectionRange(length, length);
      this.disposables.addFromEvent(input, 'keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          this.menu.close();
          return;
        }
        const onBack = this.menu.options.title?.onBack;
        if (e.key === 'Backspace' && onBack && !this.menu.showSearch$.value) {
          this.menu.close();
          onBack(this.menu);
          return;
        }
        if (e.key === 'Enter' && !e.isComposing) {
          this.menu.pressEnter();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.menu.focusPrev();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.menu.focusNext();
          return;
        }
      });

      this.disposables.addFromEvent(input, 'copy', e => {
        e.stopPropagation();
      });
      this.disposables.addFromEvent(input, 'cut', e => {
        e.stopPropagation();
      });
      this.disposables.addFromEvent(this, 'click', this._clickContainer);
    }
  }

  focusInput() {
    this.searchRef.value?.focus();
  }

  focusTo(ele?: MenuFocusable) {
    this.menu.setFocusOnly(ele);
    this.focusInput();
  }

  getFirstFocusableElement(): HTMLElement | null {
    return this.querySelector('[data-focusable="true"]');
  }

  getFocusableElements(): HTMLElement[] {
    return Array.from(this.querySelectorAll('[data-focusable="true"]'));
  }

  override render() {
    const result = this.menu.renderItems(this.menu.options.items);
    return html`
      ${this.renderTitle()} ${this.renderSearch()}
      <div class="affine-menu-body">
        ${result.length === 0 && this.menu.enableSearch
          ? html` <div class="no-results">No Results</div>`
          : ''}
        ${result}
      </div>
    `;
  }

  renderSearch() {
    const config = this.menu.options.search;
    const showSearch = this.menu.showSearch$.value || config?.placeholder;
    const searchStyle = styleMap({
      opacity: showSearch ? '1' : '0',
      height: showSearch ? undefined : '0',
      overflow: showSearch ? undefined : 'hidden',
      position: showSearch ? undefined : 'absolute',
      pointerEvents: showSearch ? undefined : 'none',
    });
    return html` <div style=${searchStyle} class="affine-menu-search-container">
      <div
        style="font-size:20px;display:flex;align-items:center;color: var(--affine-text-secondary-color)"
      >
        ${SearchIcon()}
      </div>
      <input
        autocomplete="off"
        class="affine-menu-search"
        placeholder="${config?.placeholder ?? ''}"
        data-1p-ignore
        ${ref(this.searchRef)}
        type="text"
        value="${this.menu.searchName$.value}"
        @input="${(e: Event) =>
          (this.menu.searchName$.value = (e.target as HTMLInputElement).value)}"
      />
    </div>`;
  }

  renderTitle() {
    const title = this.menu.options.title;
    if (!title) {
      return;
    }
    return html`
      <div
        style="display:flex;align-items:center;gap: 4px;padding:3px 4px 3px 2px"
        @mouseenter="${() => this.menu.closeSubMenu()}"
      >
        ${title.onBack
          ? html` <div
              @click="${() => {
                title.onBack?.(this.menu);
                this.menu.close();
              }}"
              class="dv-icon-20 dv-hover dv-pd-2 dv-round-4"
              style="display:flex;"
            >
              ${ArrowLeftBigIcon()}
            </div>`
          : nothing}
        <div
          style="flex:1;font-weight:500;font-size: 14px;line-height: 22px;color: var(--affine-text-primary-color)"
        >
          ${title.text}
        </div>
        ${title.postfix?.()}
        ${title.onClose
          ? html` <div
              @click="${title.onClose}"
              class="dv-icon-20 dv-hover dv-pd-2 dv-round-4"
              style="display:flex;"
            >
              ${CloseIcon()}
            </div>`
          : nothing}
      </div>
    `;
  }

  @property({ attribute: false })
  accessor menu!: Menu;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-menu': MenuComponent;
  }
}

export class MobileMenuComponent
  extends SignalWatcher(WithDisposable(ShadowlessElement))
  implements MenuComponentInterface
{
  static override styles = css`
    mobile-menu {
      height: 100%;
      font-family: var(--affine-font-family);
      display: flex;
      flex-direction: column;
      user-select: none;
      width: 100%;
      background-color: ${unsafeCSSVarV2('layer/background/secondary')};
      padding: calc(8px + env(safe-area-inset-top, 0px)) 8px
        calc(8px + env(safe-area-inset-bottom, 0px)) 8px;
      position: absolute;
      z-index: 999;
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .mobile-menu-body {
      display: flex;
      flex-direction: column;
      padding: 24px 16px;
      gap: 16px;
      flex: 1;
      overflow-y: auto;
    }
  `;

  onClose = () => {
    const close = this.menu.options.title?.onClose;
    if (close) {
      close();
    } else {
      this.menu.close();
    }
  };

  focusTo(ele?: MenuFocusable) {
    this.menu.setFocusOnly(ele);
  }

  getFirstFocusableElement(): HTMLElement | null {
    return this.querySelector('[data-focusable="true"]');
  }

  getFocusableElements(): HTMLElement[] {
    return Array.from(this.querySelectorAll('[data-focusable="true"]'));
  }

  override render() {
    const result = this.menu.renderItems(this.menu.options.items);
    return html`
      ${this.renderTitle()}
      <div class="mobile-menu-body">${result}</div>
    `;
  }

  renderTitle() {
    const title = this.menu.options.title;
    return html`
      <div
        style="display:flex;align-items:center;height: 44px;"
        @mouseenter="${() => this.menu.closeSubMenu()}"
      >
        <div style="width: 50px;flex-shrink: 0;margin-left: 10px;">
          ${title?.onBack
            ? html` <div
                @click="${() => {
                  title.onBack?.(this.menu);
                  this.menu.close();
                }}"
                style="
                display:flex;
                font-size: 24px;
                align-items:center;
"
              >
                ${ArrowLeftSmallIcon()}
              </div>`
            : nothing}
        </div>
        <div
          style="
          flex:1;
          font-size: 17px;
          font-style: normal;
          font-weight: 500;
          line-height: 22px;
          color: var(--affine-text-primary-color);
          display: flex;
          justify-content: center;
"
        >
          ${title?.text}
        </div>
        <div
          @click="${this.onClose}"
          style="
          display:flex;
          font-weight: 500;
          font-size: 17px;
          color: ${unsafeCSSVarV2('button/primary')};
          width: 50px;
          flex-shrink: 0;
          margin-right: 10px;
         "
        >
          Done
        </div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor menu!: Menu;
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-menu': MobileMenuComponent;
  }
}

export const getDefaultModalRoot = (ele: HTMLElement) => {
  const host: HTMLElement | null =
    ele.closest('editor-host') ?? ele.closest('.data-view-popup-container');
  if (host) {
    return host;
  }
  return document.body;
};
export const createModal = (container: HTMLElement = document.body) => {
  const div = document.createElement('div');
  div.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
  div.style.pointerEvents = 'auto';
  div.style.position = 'absolute';
  div.style.left = '0';
  div.style.top = '0';
  div.style.width = '100%';
  div.style.height = '100%';
  div.style.zIndex = '1001';
  div.style.fontFamily = 'var(--affine-font-family)';
  container.append(div);
  return div;
};
export type PopupTarget = {
  targetRect: ReferenceElement;
  root: HTMLElement;
  popupStart: () => () => void;
};
export const popupTargetFromElement = (element: HTMLElement): PopupTarget => {
  let rect = element.getBoundingClientRect();
  let count = 0;
  let isActive = false;
  return {
    targetRect: {
      getBoundingClientRect: () => {
        if (element.isConnected) {
          return (rect = element.getBoundingClientRect());
        }
        return rect;
      },
    },
    root: getDefaultModalRoot(element),
    popupStart: () => {
      if (!count) {
        isActive = element.classList.contains('active');
        if (!isActive) {
          element.classList.add('active');
        }
      }
      count++;
      return () => {
        count--;
        if (!count && !isActive) {
          element.classList.remove('active');
        }
      };
    },
  };
};
export const createPopup = (
  target: PopupTarget,
  content: HTMLElement,
  options?: {
    onClose?: () => void;
    middleware?: Array<Middleware | null | undefined | false>;
    container?: HTMLElement;
    placement?: Placement;
  }
) => {
  const close = () => {
    modal.remove();
    options?.onClose?.();
  };
  const modal = createModal(target.root);
  autoUpdate(target.targetRect, content, () => {
    computePosition(target.targetRect, content, {
      placement: options?.placement,
      middleware: options?.middleware ?? [shift({ crossAxis: true })],
    })
      .then(({ x, y }) => {
        Object.assign(content.style, {
          left: `${x}px`,
          top: `${y}px`,
        });
      })
      .catch(console.error);
  });
  modal.append(content);

  modal.onpointerdown = ev => {
    if (ev.target === modal) {
      close();
    }
  };

  modal.onmousedown = ev => {
    if (ev.target === modal) {
      close();
    }
  };

  modal.oncontextmenu = ev => {
    ev.preventDefault();
    if (ev.target === modal) {
      close();
    }
  };

  return close;
};

export type MenuHandler = {
  close: () => void;
  menu: Menu;
  reopen: () => void;
};

const popMobileMenu = (options: MenuOptions): MenuHandler => {
  const model = createModal(document.body);
  model.style.position = 'fixed';
  const menu = new Menu({
    ...options,
    onClose: () => {
      closePopup();
    },
  });
  model.append(menu.menuElement);
  const closePopup = () => {
    model.remove();
    options.onClose?.();
  };
  return {
    close: () => {
      menu.close();
    },
    menu,
    reopen: () => {
      menu.close();
      popMobileMenu(options);
    },
  };
};

export const popMenu = (
  target: PopupTarget,
  props: {
    options: MenuOptions;
    middleware?: Array<Middleware | null | undefined | false>;
    container?: HTMLElement;
    placement?: Placement;
  }
): MenuHandler => {
  if (IS_MOBILE) {
    return popMobileMenu(props.options);
  }
  const popupEnd = target.popupStart();
  const onClose = () => {
    props.options.onClose?.();
    popupEnd();
    closePopup();
  };
  const menu = new Menu({
    ...props.options,
    onClose: onClose,
  });
  const closePopup = createPopup(target, menu.menuElement, {
    onClose: () => {
      menu.close();
    },
    middleware: props.middleware ?? [
      autoPlacement({
        allowedPlacements: [
          'bottom-start',
          'bottom-end',
          'top-start',
          'top-end',
        ],
      }),
      offset(4),
    ],
    container: props.container,
    placement: props.placement,
  });
  return {
    close: closePopup,
    menu,
    reopen: () => {
      popMenu(target, props);
    },
  };
};
export const popFilterableSimpleMenu = (
  target: PopupTarget,
  options: MenuConfig[],
  onClose?: () => void,
  placement: Placement = 'bottom-start'
) => {
  popMenu(target, {
    options: {
      items: options,
      onClose,
    },
    placement,
  });
};
