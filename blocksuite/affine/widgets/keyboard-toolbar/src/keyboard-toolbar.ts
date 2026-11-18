import { getSelectedModelsCommand } from '@blocksuite/affine-shared/commands';
import type { VirtualKeyboardProviderWithAction } from '@blocksuite/affine-shared/services';
import { getViewportElement } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ArrowLeftBigIcon, KeyboardIcon } from '@blocksuite/icons/lit';
import {
  BlockComponent,
  PropTypes,
  requiredProperties,
  ShadowlessElement,
} from '@blocksuite/std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
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
  isSelectionStaleForFocus,
  panelPaddingBottom,
  scrollIntoViewDelta,
  selectionKey,
  shouldRescrollAfterKeyboardChange,
  shouldScrollForSelectionChange,
} from './utils';

export const AFFINE_KEYBOARD_TOOLBAR = 'affine-keyboard-toolbar';

// 999.11: shared by all toolbar instances -- see shouldScrollForSelectionChange.
const lastSelectionKeyByRoot = new WeakMap<object, string>();

function getCaretBottom(): number | null {
  const selection = document.getSelection();
  if (!selection?.rangeCount) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.height > 0 ? rect.bottom : null;
}

@requiredProperties({
  config: PropTypes.object,
  rootComponent: PropTypes.instanceOf(BlockComponent),
})
export class AffineKeyboardToolbar extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = keyboardToolbarStyles;

  get std() {
    return this.rootComponent.std;
  }

  get panelOpened() {
    return this._currentPanelIndex$.value !== -1;
  }

  private get panelHeight() {
    // keyboard-toolbar-panel-expand-bug: `panelOpened` must win over
    // `keyboard.visible$`. Pressing "+"/"X" dismisses/restores the real
    // keyboard via blur/refocus (see widget.ts's `hide`/`show`), which is
    // asynchronous -- `keyboard.visible$` only catches up once the actual
    // on-screen keyboard finishes animating and `visualViewport` fires, so
    // there's a window where it still reports the pre-toggle state. Letting
    // it win over `panelOpened` meant the explicit, deliberate "+"/"X"
    // toggle could never actually take effect while that signal happened
    // to say "visible" -- confirmed directly: pressing "+" with the
    // keyboard up never expanded the panel, and closing it/selecting an
    // item never collapsed it back down either, both for the same reason.
    // `panelOpened` is the one thing in this check we control exactly and
    // deliberately, so check it first.
    if (this.panelOpened) {
      return `${
        this.keyboard.staticHeight$.value !== 0
          ? this.keyboard.staticHeight$.value
          : 330
      }px`;
    }
    if (this.keyboard.visible$.value) {
      return `${this.keyboard.height$.value}px`;
    }
    return this.keyboard.appTabSafeArea$.value;
  }

  // keyboard-toolbar-hide-show-crash-bug: `this.keyboard` is always the
  // `widget.ts`-synthesized object -- it merges a fallback `show`/`hide`
  // (inputMode toggle + blur/refocus, see widget.ts) under the real
  // platform provider's own fields, so `hide`/`show` are guaranteed to
  // exist here regardless of platform. No guard needed at this call site.
  private readonly _showKeyboard = () => this.keyboard.show();

  private readonly _hideKeyboard = () => this.keyboard.hide();

  /**
   * Prevent flickering during keyboard opening
   */
  private _resetPanelIndexTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  private readonly _closeToolPanel = () => {
    if (!this.keyboard.visible$.peek()) this._showKeyboard();

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
        this._hideKeyboard();
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
        // 999.1 A-2: never scroll to a selection the user has already left
        // (e.g. focus moved into a database row) -- see utils.ts.
        if (isSelectionStaleForFocus(block, document.activeElement)) return;

        const { y: y1 } = this.getBoundingClientRect();
        const { bottom: y2 } = block.getBoundingClientRect();
        const gap = 8;
        const delta = scrollIntoViewDelta(y1, y2, getCaretBottom(), gap);
        if (delta === 0) return;

        // keyboard-toolbar-window-scroll-bug: this used to call the global
        // `scrollTo()`, i.e. `window.scrollTo()` -- scrolling the WHOLE
        // DOCUMENT instead of the actual scroll container
        // (`getViewportElement`'s `.affine-page-viewport`). On mobile, with
        // the keyboard open, that produced exactly the symptom reported:
        // window.scrollY and visualViewport.offsetTop swinging by hundreds
        // of px (confirmed live via the mobile-debug-eval channel), with the
        // fixed-position toolbar visibly dragging along with it on every
        // selection change this effect re-fires for -- not a one-time
        // settle, but continuous churn. Two browser-level mitigations
        // (locking `<html>`'s overflow, `interactive-widget=resizes-content`)
        // were tried and both failed to help, because the real scroll was
        // never browser-chrome-driven in the first place -- it was this
        // line, explicitly scrolling `window`. Scrolling the correct
        // container instead removes the window-scroll entirely.
        const viewportEl = getViewportElement(this.std.host);
        if (!viewportEl) return;

        viewportEl.scrollTo({
          top: viewportEl.scrollTop + delta,
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
          // keyboard-toggle-button-wiring: this used to gate on
          // `keyboard.staticHeight$.value === 0` (meaning "we've never
          // measured the real keyboard's height yet, so don't touch it"),
          // a leftover from when `_hideKeyboard`/`_showKeyboard` had no
          // working web implementation at all. Now that they reliably
          // blur/refocus (see widget.ts), that guard no longer applies --
          // this button should behave exactly like the "+" button's own
          // toggle: close an open panel if there is one, otherwise toggle
          // the real keyboard directly.
          if (this.panelOpened) {
            this._closeToolPanel();
            return;
          }
          if (this.keyboard.visible$.peek()) {
            this._hideKeyboard();
          } else {
            this._showKeyboard();
          }
        }}
      >
        ${KeyboardIcon()}
      </icon-button>
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');

    this._disposables.add(
      effect(() => {
        this.toggleAttribute(
          'data-keyboard-visible',
          this.keyboard.visible$.value
        );
        this.toggleAttribute('data-panel-open', this.panelOpened);
        // keyboard-toolbar-y-jump: do NOT set `this.style.bottom` here.
        //
        // The host stays at `bottom: 0` (styles.ts) and the reserved
        // bottom offset is supplied *once*, by the always-present
        // `<affine-keyboard-tool-panel>` spacer, whose inline `height` is
        // `panelHeight` (== keyboard.height$ while the keyboard is visible,
        // staticHeight$ while a panel is open, appTabSafeArea$ otherwise).
        // That spacer is what lifts the icon bar onto the keyboard's top
        // edge -- so the live keyboard height is already actively tracked
        // and no `100dvh` recompute is relied upon (this element is
        // `position: fixed`).
        //
        // Commit d6c2537e40 additionally wrote that same offset into
        // `style.bottom`, which double-counted it: the icon bar rendered
        // 2 x height$ above the viewport bottom, i.e. floating one whole
        // keyboard-height above the keyboard. Because height$ is recomputed
        // per un-debounced visualViewport event on iOS, the excess varied
        // continuously, which is why the defect presented as a random
        // Y-jump rather than a fixed gap. Geometry is asserted by
        // keyboard-toolbar-geometry-touch.spec.ts.
        console.debug('[MobileDebugLog] keyboard-toolbar-style-bottom', {
          timestampMs: Date.now(),
          keyboardVisible: this.keyboard.visible$.value,
          keyboardHeight: this.keyboard.height$.value,
          appTabSafeArea: this.keyboard.appTabSafeArea$.value,
          panelOpened: this.panelOpened,
          panelHeight: this.panelHeight,
          hostStyleBottom: getComputedStyle(this).bottom,
        });
      })
    );

    // prevent editor blur when click item in toolbar
    this.disposables.addFromEvent(this, 'pointerdown', e => {
      e.preventDefault();
    });

    // 999.11: only a selection that actually changed scrolls -- a touch to
    // scroll the page re-emits the same selection, and this toolbar may be a
    // freshly re-created instance (see shouldScrollForSelectionChange).
    this.disposables.add(
      effect(() => {
        const std = this.rootComponent.std;
        const key = selectionKey(std.selection.value);
        if (
          !shouldScrollForSelectionChange(
            lastSelectionKeyByRoot,
            this.rootComponent,
            key
          )
        )
          return;
        // wait cursor updated
        requestAnimationFrame(() => {
          this._scrollCurrentBlockIntoView();
        });
      })
    );

    // 999.1: re-check once the toolbar has moved onto the rising keyboard
    // (see shouldRescrollAfterKeyboardChange in utils.ts).
    let keyboardOpenedAtMs: number | undefined;
    // 999.11: a toolbar (re-)mounted while the keyboard is already up must
    // not treat that as the keyboard opening.
    let wasKeyboardVisible = this.keyboard.visible$.peek();
    this.disposables.add(
      effect(() => {
        const visible = this.keyboard.visible$.value;
        void this.keyboard.height$.value;
        const now = performance.now();
        if (visible && !wasKeyboardVisible) keyboardOpenedAtMs = now;
        wasKeyboardVisible = visible;
        if (
          !shouldRescrollAfterKeyboardChange(visible, keyboardOpenedAtMs, now)
        )
          return;
        // after the spacer re-renders at the new height
        this.updateComplete
          .then(() => {
            requestAnimationFrame(() => {
              this._scrollCurrentBlockIntoView();
            });
          })
          .catch(console.error);
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

  // 999.11: the former firstUpdated 700ms scroll ("workaround for the
  // virtual keyboard showing transition animation") is gone: it re-scrolled
  // on every toolbar re-mount, and the keyboard-open re-check above now
  // covers the opening animation.

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
          paddingBottom: panelPaddingBottom(
            this.panelOpened,
            this.keyboard.visible$.value,
            this.keyboard.appTabSafeArea$.value
          ),
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
