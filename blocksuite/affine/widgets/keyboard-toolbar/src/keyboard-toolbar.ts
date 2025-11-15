import { getSelectedModelsCommand } from '@blocksuite/affine-shared/commands';
import { type VirtualKeyboardProviderWithAction } from '@blocksuite/affine-shared/services';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ArrowLeftBigIcon, KeyboardIcon } from '@blocksuite/icons/lit';
import {
  BlockComponent,
  PropTypes,
  requiredProperties,
  ShadowlessElement,
} from '@blocksuite/std';
import { effect, type Signal, signal } from '@preact/signals-core';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';

import type {
  KeyboardIconType,
  KeyboardToolbarConfig,
  KeyboardToolbarContext,
  KeyboardToolbarItem,
  KeyboardToolPanelConfig,
} from './config';
import { keyboardToolbarStyles } from './styles';
import {
  isKeyboardSubToolBarConfig,
  isKeyboardToolBarActionItem,
  isKeyboardToolPanelConfig,
} from './utils';

export const AFFINE_KEYBOARD_TOOLBAR = 'affine-keyboard-toolbar';

@requiredProperties({
  config: PropTypes.object,
  rootComponent: PropTypes.instanceOf(BlockComponent),
})
export class AffineKeyboardToolbar extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = keyboardToolbarStyles;

  private readonly _expanded$ = signal(false);

  get std() {
    return this.rootComponent.std;
  }

  get panelOpened() {
    return this._currentPanelIndex$.value !== -1;
  }

  private get panelHeight() {
    return this._expanded$.value
      ? `${
          this.keyboard.staticHeight$.value !== 0
            ? this.keyboard.staticHeight$.value
            : 330
        }px`
      : this.keyboard.appTabSafeArea$.value;
  }

  /**
   * Prevent flickering during keyboard opening
   */
  private _resetPanelIndexTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  private readonly _closeToolPanel = () => {
    if (!this.keyboard.visible$.peek()) this.keyboard.show();

    if (this._resetPanelIndexTimeoutId) {
      clearTimeout(this._resetPanelIndexTimeoutId);
      this._resetPanelIndexTimeoutId = null;
    }
    this._resetPanelIndexTimeoutId = setTimeout(() => {
      this._currentPanelIndex$.value = -1;
    }, 100);
  };

  private readonly _currentPanelIndex$ = signal(-1);

  private readonly _goPrevToolbar = () => {
    if (!this._isSubToolbarOpened) return;

    if (this.panelOpened) this._closeToolPanel();

    this._path$.value = this._path$.value.slice(0, -1);
  };

  private readonly _handleItemClick = (
    item: KeyboardToolbarItem,
    index: number
  ) => {
    if (isKeyboardToolBarActionItem(item)) {
      item.action &&
        Promise.resolve(item.action(this._context)).catch(console.error);
    } else if (isKeyboardSubToolBarConfig(item)) {
      this._closeToolPanel();
      this._path$.value = [...this._path$.value, index];
    } else if (isKeyboardToolPanelConfig(item)) {
      if (this._currentPanelIndex$.value === index) {
        this._closeToolPanel();
      } else {
        if (this._resetPanelIndexTimeoutId) {
          clearTimeout(this._resetPanelIndexTimeoutId);
          this._resetPanelIndexTimeoutId = null;
        }
        this._currentPanelIndex$.value = index;
        this.keyboard.hide();
        this._scrollCurrentBlockIntoView();
      }
    }
    this._lastActiveItem$.value = item;
  };

  private readonly _lastActiveItem$ = signal<KeyboardToolbarItem | null>(null);

  private readonly _path$ = signal<number[]>([]);

  private readonly _scrollCurrentBlockIntoView = () => {
    this.std.command
      .chain()
      .pipe(getSelectedModelsCommand)
      .pipe(({ selectedModels }) => {
        if (!selectedModels?.length) return;

        const block = this.std.view.getBlock(selectedModels[0].id);
        if (!block) return;

        const { y: y1 } = this.getBoundingClientRect();
        const { bottom: y2 } = block.getBoundingClientRect();
        const gap = 8;

        if (y2 < y1 + gap) return;

        scrollTo({
          top: window.scrollY + y2 - y1 + gap,
          behavior: 'instant',
        });
      })
      .run();
  };

  private get _context(): KeyboardToolbarContext {
    return {
      std: this.std,
      rootComponent: this.rootComponent,
      closeToolPanel: () => {
        this._closeToolPanel();
      },
    };
  }

  private get _currentPanelConfig(): KeyboardToolPanelConfig | null {
    if (!this.panelOpened) return null;

    const result = this._currentToolbarItems[this._currentPanelIndex$.value];

    return isKeyboardToolPanelConfig(result) ? result : null;
  }

  private get _currentToolbarItems(): KeyboardToolbarItem[] {
    let items = this.config.items;
    for (const index of this._path$.value) {
      if (isKeyboardSubToolBarConfig(items[index])) {
        items = items[index].items;
      } else {
        break;
      }
    }

    return items.filter(item =>
      isKeyboardToolBarActionItem(item)
        ? (item.showWhen?.(this._context) ?? true)
        : true
    );
  }

  private get _isSubToolbarOpened() {
    return this._path$.value.length > 0;
  }

  private _renderIcon(icon: KeyboardIconType) {
    return typeof icon === 'function' ? icon(this._context) : icon;
  }

  private _renderItem(item: KeyboardToolbarItem, index: number) {
    let icon = item.icon;
    let style = styleMap({});
    const disabled =
      ('disableWhen' in item && item.disableWhen?.(this._context)) ?? false;

    if (isKeyboardToolBarActionItem(item)) {
      const background =
        typeof item.background === 'function'
          ? item.background(this._context)
          : item.background;
      if (background)
        style = styleMap({
          background: background,
        });
    } else if (isKeyboardToolPanelConfig(item)) {
      const { activeIcon, activeBackground } = item;
      const active = this._currentPanelIndex$.value === index;

      if (active && activeIcon) icon = activeIcon;
      if (active && activeBackground)
        style = styleMap({ background: activeBackground });
    }

    return html`<icon-button
      size="36px"
      style=${style}
      ?disabled=${disabled}
      @click=${() => {
        this._handleItemClick(item, index);
      }}
    >
      ${this._renderIcon(icon)}
    </icon-button>`;
  }

  private _renderItems() {
    if (!this.std.event.active$.value)
      return html`<div class="item-container"></div>`;

    const goPrevToolbarAction = when(
      this._isSubToolbarOpened,
      () =>
        html`<icon-button size="36px" @click=${this._goPrevToolbar}>
          ${ArrowLeftBigIcon()}
        </icon-button>`
    );

    return html`<div class="item-container">
      ${goPrevToolbarAction}
      ${repeat(this._currentToolbarItems, (item, index) =>
        this._renderItem(item, index)
      )}
    </div>`;
  }

  private _renderKeyboardButton() {
    return html`<div class="keyboard-container">
      <icon-button
        size="36px"
        @click=${() => {
          if (this.keyboard.staticHeight$.value === 0) {
            this._closeToolPanel();
            return;
          }
          if (this.keyboard.visible$.peek()) {
            this.keyboard.hide();
          } else {
            this.keyboard.show();
          }
        }}
      >
        ${KeyboardIcon()}
      </icon-button>
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();

    // There are two cases that `_expanded$` will be true:
    // 1. when virtual keyboard is opened, the panel need to be expanded and overlapped by the keyboard,
    // so that the toolbar will be on the top of the keyboard.
    // 2. the panel is opened, whether the keyboard is closed or not exists (e.g. a physical keyboard connected)
    //
    // There is one case that `_expanded$` will be false:
    // 1. the panel is closed, and the keyboard is closed, the toolbar will be rendered at the bottom of the viewport
    this._disposables.add(
      effect(() => {
        if (this.keyboard.visible$.value || this.panelOpened) {
          this._expanded$.value = true;
        } else {
          this._expanded$.value = false;
        }
      })
    );

    // prevent editor blur when click item in toolbar
    this.disposables.addFromEvent(this, 'pointerdown', e => {
      e.preventDefault();
    });

    this.disposables.add(
      effect(() => {
        const std = this.rootComponent.std;
        std.selection.value;
        // wait cursor updated
        requestAnimationFrame(() => {
          this._scrollCurrentBlockIntoView();
        });
      })
    );

    this.disposables.add(
      effect(() => {
        // sometime the keyboard will auto show when user click into different paragraph in Android,
        // so we need to close the tool panel explicitly when the keyboard is visible
        if (this.keyboard.visible$.value) {
          this._closeToolPanel();
        }
      })
    );

    this._watchAutoShow();

    this.disposables.add(() => {
      if (this._resetPanelIndexTimeoutId) {
        clearTimeout(this._resetPanelIndexTimeoutId);
        this._resetPanelIndexTimeoutId = null;
      }
    });
  }

  private _watchAutoShow() {
    const autoShowSubToolbars: { path: number[]; signal: Signal<boolean> }[] =
      [];

    const traverse = (item: KeyboardToolbarItem, path: number[]) => {
      if (isKeyboardSubToolBarConfig(item) && item.autoShow) {
        autoShowSubToolbars.push({
          path,
          signal: item.autoShow(this._context),
        });

        item.items.forEach((subItem, index) => {
          traverse(subItem, [...path, index]);
        });
      }
    };
    this.config.items.forEach((item, index) => {
      traverse(item, [index]);
    });

    const samePath = (a: number[], b: number[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);

    let prevPath = this._path$.peek();
    this.disposables.add(
      effect(() => {
        autoShowSubToolbars.forEach(({ path, signal }) => {
          if (signal.value) {
            if (samePath(this._path$.peek(), path)) return;

            prevPath = this._path$.peek();
            this._path$.value = path;
          } else {
            this._path$.value = prevPath;
          }
        });
      })
    );
  }

  override firstUpdated() {
    // workaround for the virtual keyboard showing transition animation
    const timeoutId = setTimeout(() => {
      this._scrollCurrentBlockIntoView();
    }, 700);
    this.disposables.add(() => {
      clearTimeout(timeoutId);
    });
  }

  override render() {
    return html`
      <div class="keyboard-toolbar">
        ${this._renderItems()}
        <div class="divider"></div>
        ${this._renderKeyboardButton()}
      </div>
      <affine-keyboard-tool-panel
        .config=${this._currentPanelConfig}
        .context=${this._context}
        style=${styleMap({
          height: this.panelHeight,
          paddingBottom: this.keyboard.appTabSafeArea$.value,
        })}
      ></affine-keyboard-tool-panel>
    `;
  }

  @property({ attribute: false })
  accessor keyboard!: VirtualKeyboardProviderWithAction;

  @property({ attribute: false })
  accessor config!: KeyboardToolbarConfig;

  @property({ attribute: false })
  accessor rootComponent!: BlockComponent;
}
