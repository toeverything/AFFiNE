/* oxlint-disable @typescript-eslint/no-non-null-assertion */
import {
  DefaultTool,
  EdgelessLegacySlotIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  type MenuHandler,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import {
  darkToolbarStyles,
  lightToolbarStyles,
} from '@blocksuite/affine-components/toolbar';
import { ColorScheme, type RootBlockModel } from '@blocksuite/affine-model';
import {
  EditPropsStore,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons/lit';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { autoPlacement, offset } from '@floating-ui/dom';
import { ContextProvider } from '@lit/context';
import { computed } from '@preact/signals-core';
import { baseTheme, cssVar } from '@toeverything/theme';
import { css, html, nothing, unsafeCSS } from 'lit';
import { query, state } from 'lit/decorators.js';
import { cache } from 'lit/directives/cache.js';
import { literal, unsafeStatic } from 'lit/static-html.js';
import debounce from 'lodash-es/debounce';
import { Subject } from 'rxjs';

import {
  edgelessToolbarContext,
  type EdgelessToolbarSlots,
  edgelessToolbarSlotsContext,
  edgelessToolbarThemeContext,
} from './context.js';
import type { MenuPopper } from './create-popper.js';
import {
  QuickToolIdentifier,
  SeniorToolIdentifier,
} from './extension/index.js';

const TOOLBAR_PADDING_X = 12;
const TOOLBAR_HEIGHT = 64;
const QUICK_TOOLS_GAP = 10;
const QUICK_TOOL_SIZE = 36;
const QUICK_TOOL_MORE_SIZE = 20;
const SENIOR_TOOLS_GAP = 0;
const SENIOR_TOOL_WIDTH = 96;
const SENIOR_TOOL_NAV_SIZE = 20;
const DIVIDER_WIDTH = 8;
const DIVIDER_SPACE = 8;
const SAFE_AREA_WIDTH = 64;

export const EDGELESS_TOOLBAR_WIDGET = 'edgeless-toolbar-widget';
export class EdgelessToolbarWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    :host {
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      position: absolute;
      z-index: 1;
      left: calc(50%);
      transform: translateX(-50%);
      bottom: 0;
      -webkit-user-select: none;
      user-select: none;
      width: 100%;
      pointer-events: none;
    }
    .edgeless-toolbar-wrapper {
      width: 100%;
      display: flex;
      justify-content: center;
    }
    ${unsafeCSS(lightToolbarStyles('.edgeless-toolbar-wrapper'))}
    ${unsafeCSS(darkToolbarStyles('.edgeless-toolbar-wrapper'))}

    .edgeless-toolbar-toggle-control {
      pointer-events: auto;
      padding-bottom: 16px;
      width: fit-content;
      max-width: calc(100% - ${unsafeCSS(SAFE_AREA_WIDTH)}px * 2);
      min-width: 264px;
    }
    .edgeless-toolbar-toggle-control[data-enable='true'] {
      transition: 0.23s ease;
      padding-top: 100px;
      transform: translateY(100px);
    }
    .edgeless-toolbar-toggle-control[data-enable='true']:hover {
      padding-top: 0;
      transform: translateY(0);
    }

    .edgeless-toolbar-smooth-corner {
      display: block;
      width: fit-content;
      max-width: 100%;
    }
    .edgeless-toolbar-container {
      position: relative;
      display: flex;
      align-items: center;
      padding: 0 ${unsafeCSS(TOOLBAR_PADDING_X)}px;
      height: ${unsafeCSS(TOOLBAR_HEIGHT)}px;
    }
    :host([disabled]) .edgeless-toolbar-container {
      pointer-events: none;
    }
    .edgeless-toolbar-container[level='second'] {
      position: absolute;
      bottom: 8px;
      transform: translateY(-100%);
    }
    .edgeless-toolbar-container[hidden] {
      display: none;
    }
    .quick-tools {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${unsafeCSS(QUICK_TOOLS_GAP)}px;
    }
    .full-divider {
      width: ${unsafeCSS(DIVIDER_WIDTH)}px;
      height: 100%;
      margin: 0 ${unsafeCSS(DIVIDER_SPACE)}px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .full-divider::after {
      content: '';
      display: block;
      width: 1px;
      height: 100%;
      background-color: var(--affine-border-color);
    }
    .pen-and-eraser {
      display: flex;
      height: 100%;
      gap: 4px;
      justify-content: center;
    }
    .senior-tools {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: ${unsafeCSS(SENIOR_TOOLS_GAP)}px;
      height: 100%;
      min-width: ${unsafeCSS(SENIOR_TOOL_WIDTH)}px;
    }
    .quick-tool-item {
      width: ${unsafeCSS(QUICK_TOOL_SIZE)}px;
      height: ${unsafeCSS(QUICK_TOOL_SIZE)}px;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
    }
    .quick-tool-more {
      width: 0;
      height: ${unsafeCSS(QUICK_TOOL_SIZE)}px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: all 0.23s ease;
      overflow: hidden;
    }
    [data-dense-quick='true'] .quick-tool-more {
      width: ${unsafeCSS(QUICK_TOOL_MORE_SIZE)}px;
      margin-left: ${unsafeCSS(DIVIDER_SPACE)}px;
    }
    .quick-tool-more-button {
      padding: 0;
    }

    .senior-tool-item {
      width: ${unsafeCSS(SENIOR_TOOL_WIDTH)}px;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
    }
    .senior-nav-button-wrapper {
      flex-shrink: 0;
      width: 0px;
      height: ${unsafeCSS(SENIOR_TOOL_NAV_SIZE)}px;
      transition: width 0.23s ease;
      overflow: hidden;
    }
    .senior-nav-button {
      padding: 0;
    }
    .senior-nav-button svg {
      width: 20px;
      height: 20px;
    }
    [data-dense-senior='true'] .senior-nav-button-wrapper {
      width: ${unsafeCSS(SENIOR_TOOL_NAV_SIZE)}px;
    }
    [data-dense-senior='true'] .senior-nav-button-wrapper.prev {
      margin-right: ${unsafeCSS(DIVIDER_SPACE)}px;
    }
    [data-dense-senior='true'] .senior-nav-button-wrapper.next {
      margin-left: ${unsafeCSS(DIVIDER_SPACE)}px;
    }
    .transform-button svg {
      transition: 0.3s ease-in-out;
    }
    .transform-button:hover svg {
      transform: scale(1.15);
    }
  `;

  private readonly _appTheme$ = computed(() => {
    return this.std.get(ThemeProvider).app$.value;
  });

  private _moreQuickToolsMenu: MenuHandler | null = null;

  private _moreQuickToolsMenuRef: HTMLElement | null = null;

  @state()
  accessor containerWidth = 1920;

  private readonly _onContainerResize = debounce(
    ({ w }: { w: number }) => {
      if (!this.isConnected) return;

      this.slots.resize.next({ w, h: TOOLBAR_HEIGHT });
      this.containerWidth = w;

      if (this._denseSeniorTools) {
        this.scrollSeniorToolIndex = Math.min(
          this._seniorTools.length - this.scrollSeniorToolSize,
          this.scrollSeniorToolIndex
        );
      } else {
        this.scrollSeniorToolIndex = 0;
      }

      if (
        this._denseQuickTools &&
        this._moreQuickToolsMenu &&
        this._moreQuickToolsMenuRef
      ) {
        this._moreQuickToolsMenu.close();
        this._openMoreQuickToolsMenu({
          currentTarget: this._moreQuickToolsMenuRef,
        });
      }
      if (!this._denseQuickTools && this._moreQuickToolsMenu) {
        this._moreQuickToolsMenu.close();
        this._moreQuickToolsMenu = null;
      }
    },
    300,
    { leading: true }
  );

  private _resizeObserver: ResizeObserver | null = null;

  private readonly _slotsProvider = new ContextProvider(this, {
    context: edgelessToolbarSlotsContext,
    initialValue: { resize: new Subject() } satisfies EdgelessToolbarSlots,
  });

  private readonly _themeProvider = new ContextProvider(this, {
    context: edgelessToolbarThemeContext,
    initialValue: ColorScheme.Light,
  });

  private readonly _toolbarProvider = new ContextProvider(this, {
    context: edgelessToolbarContext,
    initialValue: this,
  });

  activePopper: MenuPopper<HTMLElement> | null = null;

  // calculate all the width manually
  private get _availableWidth() {
    return this.containerWidth - 2 * SAFE_AREA_WIDTH;
  }

  private get _cachedPresentHideToolbar() {
    return !!this.std.get(EditPropsStore).getStorage('presentHideToolbar');
  }

  private get _denseQuickTools() {
    return (
      this._availableWidth -
        this._seniorToolNavWidth -
        1 * SENIOR_TOOL_WIDTH -
        2 * TOOLBAR_PADDING_X <
      this._quickToolsWidthTotal
    );
  }

  private get _denseSeniorTools() {
    return (
      this._availableWidth -
        this._quickToolsWidthTotal -
        this._spaceWidthTotal <
      this._seniorToolsWidthTotal
    );
  }

  /**
   * When enabled, the toolbar will auto-hide when the mouse is not over it.
   */
  private get _enableAutoHide() {
    return (
      this.isPresentMode &&
      this._cachedPresentHideToolbar &&
      !this.presentSettingMenuShow &&
      !this.presentFrameMenuShow
    );
  }

  private get _hiddenQuickTools() {
    return this._quickTools
      .slice(this._visibleQuickToolSize)
      .filter(tool => !!tool.menu);
  }

  private get _quickTools() {
    const block = this.block;
    if (!block) {
      return [];
    }
    const quickTools = Array.from(
      this.std.provider.getAll(QuickToolIdentifier).values()
    );
    const gfx = this.std.get(GfxControllerIdentifier);
    return quickTools
      .map(tool =>
        tool({ block, gfx, toolbarContainer: this.toolbarContainer })
      )
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .filter(({ enable = true }) => enable);
  }

  private get _quickToolsWidthTotal() {
    return (
      this._quickTools.length * (QUICK_TOOL_SIZE + QUICK_TOOLS_GAP) -
      QUICK_TOOLS_GAP
    );
  }

  private get _seniorNextTooltip() {
    if (this._seniorScrollNextDisabled) return '';
    const nextTool =
      this._seniorTools[this.scrollSeniorToolIndex + this.scrollSeniorToolSize];
    return nextTool?.name ?? '';
  }

  private get _seniorPrevTooltip() {
    if (this._seniorScrollPrevDisabled) return '';
    const prevTool = this._seniorTools[this.scrollSeniorToolIndex - 1];
    return prevTool?.name ?? '';
  }

  private get _seniorScrollNextDisabled() {
    return (
      this.scrollSeniorToolIndex + this.scrollSeniorToolSize >=
      this._seniorTools.length
    );
  }

  private get _seniorScrollPrevDisabled() {
    return this.scrollSeniorToolIndex === 0;
  }

  private get _seniorToolNavWidth() {
    return this._denseSeniorTools
      ? (SENIOR_TOOL_NAV_SIZE + DIVIDER_SPACE) * 2
      : 0;
  }

  private get _seniorTools() {
    const block = this.block;
    if (!block) {
      return [];
    }
    const seniorTools = Array.from(
      this.std.provider.getAll(SeniorToolIdentifier).values()
    );
    const gfx = this.std.get(GfxControllerIdentifier);
    return seniorTools
      .map(tool =>
        tool({ block, gfx, toolbarContainer: this.toolbarContainer })
      )
      .filter(({ enable = true }) => enable);
  }

  private get _seniorToolsWidthTotal() {
    return (
      this._seniorTools.length * (SENIOR_TOOL_WIDTH + SENIOR_TOOLS_GAP) -
      SENIOR_TOOLS_GAP
    );
  }

  private get _spaceWidthTotal() {
    return DIVIDER_WIDTH + DIVIDER_SPACE * 2 + TOOLBAR_PADDING_X * 2;
  }

  private get _visibleQuickToolSize() {
    if (!this._denseQuickTools) return this._quickTools.length;
    const availableWidth =
      this._availableWidth -
      this._seniorToolNavWidth -
      this._spaceWidthTotal -
      SENIOR_TOOL_WIDTH;
    return Math.max(
      1,
      Math.floor(
        (availableWidth - QUICK_TOOL_MORE_SIZE - DIVIDER_SPACE) /
          (QUICK_TOOL_SIZE + QUICK_TOOLS_GAP)
      )
    );
  }

  get edgelessTool() {
    return this.gfx.tool.currentToolName$.value;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get isPresentMode() {
    return this.edgelessTool === 'frameNavigator';
  }

  get scrollSeniorToolSize() {
    if (this._denseQuickTools) return 1;
    const seniorAvailableWidth =
      this._availableWidth - this._quickToolsWidthTotal - this._spaceWidthTotal;
    if (seniorAvailableWidth >= this._seniorToolsWidthTotal)
      return this._seniorTools.length;
    return (
      Math.floor(
        (seniorAvailableWidth - (SENIOR_TOOL_NAV_SIZE + DIVIDER_SPACE) * 2) /
          SENIOR_TOOL_WIDTH
      ) || 1
    );
  }

  get slots() {
    return this._slotsProvider.value;
  }

  constructor() {
    super();
  }

  private _onSeniorNavNext() {
    if (this._seniorScrollNextDisabled) return;
    this.scrollSeniorToolIndex = Math.min(
      this._seniorTools.length - this.scrollSeniorToolSize,
      this.scrollSeniorToolIndex + this.scrollSeniorToolSize
    );
  }

  private _onSeniorNavPrev() {
    if (this._seniorScrollPrevDisabled) return;
    this.scrollSeniorToolIndex = Math.max(
      0,
      this.scrollSeniorToolIndex - this.scrollSeniorToolSize
    );
  }

  private _openMoreQuickToolsMenu(e: { currentTarget: HTMLElement }) {
    if (!this._hiddenQuickTools.length) return;

    this._moreQuickToolsMenuRef = e.currentTarget;
    this._moreQuickToolsMenu = popMenu(
      popupTargetFromElement(e.currentTarget as HTMLElement),
      {
        middleware: [
          autoPlacement({
            allowedPlacements: ['top'],
          }),
          offset({
            mainAxis: (TOOLBAR_HEIGHT - QUICK_TOOL_MORE_SIZE) / 2 + 8,
          }),
        ],
        options: {
          onClose: () => {
            this._moreQuickToolsMenu = null;
            this._moreQuickToolsMenuRef = null;
          },
          items: this._hiddenQuickTools.map(tool => tool.menu!),
        },
      }
    );
  }

  private _renderContent() {
    return html`
      <div class="quick-tools">
        ${this._quickTools
          .slice(0, this._visibleQuickToolSize)
          .map(
            tool => html`<div class="quick-tool-item">${tool.content}</div>`
          )}
      </div>
      <div class="quick-tool-more">
        <icon-button
          ?disabled=${!this._denseQuickTools}
          .size=${20}
          class="quick-tool-more-button"
          @click=${this._openMoreQuickToolsMenu}
          ?active=${this._quickTools
            .slice(this._visibleQuickToolSize)
            .some(tool => tool.type === this.edgelessTool)}
        >
          ${MoreHorizontalIcon({ width: '20px', height: '20px' })}
          <affine-tooltip tip-position="top" .offset=${25}>
            More Tools
          </affine-tooltip>
        </icon-button>
      </div>
      <div class="full-divider"></div>
      <div class="senior-nav-button-wrapper prev">
        <icon-button
          .size=${20}
          class="senior-nav-button"
          ?disabled=${this._seniorScrollPrevDisabled}
          @click=${this._onSeniorNavPrev}
        >
          ${ArrowLeftSmallIcon({ width: '20px', height: '20px' })}
          ${cache(
            this._seniorPrevTooltip
              ? html` <affine-tooltip tip-position="top" .offset=${4}>
                  ${this._seniorPrevTooltip}
                </affine-tooltip>`
              : nothing
          )}
        </icon-button>
      </div>
      <div class="senior-tools">
        ${this._seniorTools
          .slice(
            this.scrollSeniorToolIndex,
            this.scrollSeniorToolIndex + this.scrollSeniorToolSize
          )
          .map(
            tool => html`<div class="senior-tool-item">${tool.content}</div>`
          )}
      </div>
      <div class="senior-nav-button-wrapper next">
        <icon-button
          .size=${20}
          class="senior-nav-button"
          ?disabled=${this._seniorScrollNextDisabled}
          @click=${this._onSeniorNavNext}
        >
          ${ArrowRightSmallIcon({ width: '20px', height: '20px' })}
          ${cache(
            this._seniorNextTooltip
              ? html` <affine-tooltip tip-position="top" .offset=${4}>
                  ${this._seniorNextTooltip}
                </affine-tooltip>`
              : nothing
          )}
        </icon-button>
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._toolbarProvider.setValue(this);
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        this._onContainerResize({ w: width });
      }
    });
    this._resizeObserver.observe(this);
    this.disposables.add(
      this.std
        .get(ThemeProvider)
        .theme$.subscribe(mode => this._themeProvider.setValue(mode))
    );
    if (!this.block) {
      return;
    }
    this._disposables.add(
      this.block.bindHotKey(
        {
          Escape: () => {
            if (this.gfx.selection.editing) return;
            if (this.edgelessTool === 'frameNavigator') return;
            if (this.edgelessTool === 'default') {
              if (this.activePopper) {
                this.activePopper.dispose();
                this.activePopper = null;
              }
              return;
            }
            this.gfx.tool.setTool(DefaultTool);
          },
        },
        { global: true }
      )
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }

  override firstUpdated() {
    const { _disposables, block, gfx } = this;
    if (!block) return;

    const slots = this.std.get(EdgelessLegacySlotIdentifier);
    const editPropsStore = this.std.get(EditPropsStore);

    _disposables.add(
      gfx.viewport.viewportUpdated.subscribe(() => this.requestUpdate())
    );
    _disposables.add(
      slots.readonlyUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );
    _disposables.add(
      slots.toolbarLocked.subscribe(disabled => {
        this.toggleAttribute('disabled', disabled);
      })
    );
    // This state from `editPropsStore` is not reactive,
    // if the value is updated outside of this component, it will not be reflected.
    _disposables.add(
      editPropsStore.slots.storageUpdated.subscribe(({ key }) => {
        if (key === 'presentHideToolbar') {
          this.requestUpdate();
        }
      })
    );
  }

  override render() {
    const type = this.edgelessTool;
    if (this.store.readonly && type !== 'frameNavigator') {
      return nothing;
    }

    return html`
      <div
        class="edgeless-toolbar-wrapper"
        data-app-theme=${this._appTheme$.value}
      >
        <div
          class="edgeless-toolbar-toggle-control"
          data-enable=${this._enableAutoHide}
        >
          <smooth-corner
            class="edgeless-toolbar-smooth-corner"
            .borderRadius=${16}
            .smooth=${0.7}
            .borderWidth=${1}
            .bgColor=${'var(--affine-background-overlay-panel-color)'}
            .borderColor=${'var(--affine-border-color)'}
            style="filter: drop-shadow(${cssVar('toolbarShadow')})"
          >
            <div
              class="edgeless-toolbar-container"
              data-dense-quick=${this._denseQuickTools &&
              this._hiddenQuickTools.length > 0}
              data-dense-senior=${this._denseSeniorTools}
              @dblclick=${stopPropagation}
              @mousedown=${stopPropagation}
              @pointerdown=${stopPropagation}
            >
              ${this.isPresentMode
                ? html`<presentation-toolbar
                    .edgeless=${this.block}
                    .settingMenuShow=${this.presentSettingMenuShow}
                    .frameMenuShow=${this.presentFrameMenuShow}
                    .setSettingMenuShow=${(show: boolean) =>
                      (this.presentSettingMenuShow = show)}
                    .setFrameMenuShow=${(show: boolean) =>
                      (this.presentFrameMenuShow = show)}
                    .containerWidth=${this.containerWidth}
                  ></presentation-toolbar>`
                : nothing}
              ${this.isPresentMode ? nothing : this._renderContent()}
            </div>
          </smooth-corner>
        </div>
      </div>
    `;
  }

  @state()
  accessor presentFrameMenuShow = false;

  @state()
  accessor presentSettingMenuShow = false;

  @state()
  accessor scrollSeniorToolIndex = 0;

  @query('.edgeless-toolbar-container')
  accessor toolbarContainer!: HTMLElement;
}

export const edgelessToolbarWidget = WidgetViewExtension(
  'affine:page',
  EDGELESS_TOOLBAR_WIDGET,
  literal`${unsafeStatic(EDGELESS_TOOLBAR_WIDGET)}`
);
