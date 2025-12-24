import { CopilotTool } from '@affine/core/blocksuite/ai/tool/copilot-tool';
import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine/blocks/surface';
import {
  Bound,
  getCommonBoundWithRotation,
} from '@blocksuite/affine/global/gfx';
import type { RootBlockModel } from '@blocksuite/affine/model';
import {
  MOUSE_BUTTON,
  requestConnectedFrame,
} from '@blocksuite/affine/shared/utils';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import {
  autoPlacement,
  autoUpdate,
  computePosition,
  limitShift,
  offset,
  shift,
  size,
} from '@floating-ui/dom';
import { effect } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

import type { AIItemGroupConfig } from '../../components/ai-item/types.js';
import { AIProvider } from '../../provider/index.js';
import { extractSelectedContent } from '../../utils/extract.js';
import {
  AFFINE_AI_PANEL_WIDGET,
  AffineAIPanelWidget,
} from '../ai-panel/ai-panel.js';
import { EdgelessCopilotPanel } from '../edgeless-copilot-panel/index.js';
import { AFFINE_EDGELESS_COPILOT_WIDGET } from './constant.js';

export class EdgelessCopilotWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    .copilot-selection-rect {
      position: absolute;
      box-sizing: border-box;
      border-radius: 4px;
      border: 2px dashed var(--affine-brand-color, #1e96eb);
    }
  `;

  private _clickOutsideOff: (() => void) | null = null;

  private _copilotPanel!: EdgelessCopilotPanel | null;

  private _listenClickOutsideId: number | null = null;

  private _selectionModelRect!: DOMRect;

  private _autoUpdateCleanup: (() => void) | null = null;

  groups: AIItemGroupConfig[] = [];

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get selectionModelRect() {
    return this._selectionModelRect;
  }

  get selectionRect() {
    return this._selectionRect;
  }

  get visible() {
    return !!(
      this._visible &&
      this._selectionRect.width &&
      this._selectionRect.height
    );
  }

  set visible(visible: boolean) {
    this._visible = visible;
  }

  private _showCopilotInput() {
    requestConnectedFrame(() => {
      const referenceElement = this.selectionElem;
      if (!referenceElement || !referenceElement.isConnected) return;

      // show ai input
      const rootBlockId = this.host.store.root?.id;
      if (!rootBlockId) return;

      const input = this.host.view.getWidget(
        AFFINE_AI_PANEL_WIDGET,
        rootBlockId
      );

      if (input instanceof AffineAIPanelWidget) {
        input.setState('input', referenceElement);
        const aiPanel = input;
        // TODO: @xiaojun refactor these scattered config overrides
        if (aiPanel.config && !aiPanel.config.generateAnswer) {
          aiPanel.config.generateAnswer = ({ finish, input }) => {
            finish('success');
            aiPanel.hide();
            extractSelectedContent(this.host)
              .then(context => {
                AIProvider.slots.requestSendWithChat.next({
                  input,
                  context,
                  host: this.host,
                });
              })
              .catch(console.error);
          };
          aiPanel.config.inputCallback = text => {
            const panel = this.shadowRoot?.querySelector(
              'edgeless-copilot-panel'
            );
            if (panel instanceof HTMLElement) {
              panel.style.visibility = text ? 'hidden' : 'visible';
            }
          };
        }
        requestAnimationFrame(() => {
          this._createCopilotPanel();
          this._updateCopilotPanel(input);
        });
      }
    }, this);
  }

  private _createCopilotPanel() {
    if (!this._copilotPanel) {
      const panel = new EdgelessCopilotPanel();
      panel.host = this.host;
      panel.groups = this.groups;
      this.renderRoot.append(panel);
      this._copilotPanel = panel;
    }
  }

  private _updateCopilotPanel(referenceElement: HTMLElement) {
    const panel = this._copilotPanel;
    if (!panel) return;

    const originMaxHeight = window.getComputedStyle(panel).maxHeight;

    this._autoUpdateCleanup?.();
    this._autoUpdateCleanup = autoUpdate(referenceElement, panel, () => {
      computePosition(referenceElement, panel, {
        placement: 'bottom-start',
        middleware: [
          offset(4),
          autoPlacement({
            padding: 10,
            allowedPlacements: [
              'top-start',
              'top-end',
              'bottom-start',
              'bottom-end',
            ],
          }),
          size({
            apply: ({ availableHeight }) => {
              availableHeight -= 10;
              panel.style.maxHeight =
                originMaxHeight && originMaxHeight !== 'none'
                  ? `min(${originMaxHeight}, ${availableHeight}px)`
                  : `${availableHeight}px`;
            },
          }),
          shift({
            padding: {
              top: 10,
              right: 10,
              bottom: 150,
              left: 10,
            },
            limiter: limitShift(),
          }),
        ],
      })
        .then(({ x, y }) => {
          panel.style.left = `${x}px`;
          panel.style.top = `${y}px`;
        })
        .catch(e => {
          console.warn("Can't compute EdgelessCopilotPanel position", e);
        });
    });
  }

  private _updateSelection(rect: DOMRect) {
    this._selectionModelRect = rect;

    const zoom = this.gfx.viewport.zoom;
    const [x, y] = this.gfx.viewport.toViewCoord(rect.left, rect.top);
    const [width, height] = [rect.width * zoom, rect.height * zoom];

    this._selectionRect = { x, y, width, height };
  }

  private _watchClickOutside() {
    this._clickOutsideOff?.();

    const { width, height } = this._selectionRect;

    if (width && height) {
      this._listenClickOutsideId &&
        cancelAnimationFrame(this._listenClickOutsideId);
      this._listenClickOutsideId = requestConnectedFrame(() => {
        if (!this.isConnected) {
          return;
        }

        const off = this.std.event.add('pointerDown', ctx => {
          const e = ctx.get('pointerState').raw;
          if (
            e.button === MOUSE_BUTTON.MAIN &&
            !this.contains(e.target as HTMLElement)
          ) {
            off();
            this._visible = false;
            this.hideCopilotPanel();
          }
        });
        this._listenClickOutsideId = null;
        this._clickOutsideOff = off;
      }, this);
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();

    const CopilotSelectionTool = this.gfx.tool.get(CopilotTool);

    this._disposables.add(
      CopilotSelectionTool.draggingAreaUpdated.subscribe(shouldShowPanel => {
        this._visible = true;
        this._updateSelection(CopilotSelectionTool.area);
        if (shouldShowPanel) {
          this._showCopilotInput();
          this._watchClickOutside();
        } else {
          this.hideCopilotPanel();
        }
      })
    );

    this._disposables.add(
      this.gfx.viewport.viewportUpdated.subscribe(() => {
        if (!this._visible) return;

        this._updateSelection(CopilotSelectionTool.area);
      })
    );

    this._disposables.add(
      effect(() => {
        const currentTool = this.gfx.tool.currentToolName$.value;

        if (!this._visible || currentTool === 'copilot') return;

        this._visible = false;
        this._clickOutsideOff = null;
        this._copilotPanel?.remove();
        this._copilotPanel = null;
      })
    );

    this._disposables.add(() => this._autoUpdateCleanup?.());
  }

  determineInsertionBounds(width = 800, height = 95) {
    const elements = this.gfx.selection.selectedElements;
    const offsetY = 20 / this.gfx.viewport.zoom;
    const bounds = new Bound(0, 0, width, height);
    if (elements.length) {
      const { x, y, h } = getCommonBoundWithRotation(elements);
      bounds.x = x;
      bounds.y = y + h + offsetY;
    } else {
      const { x, y, height: h } = this.selectionModelRect;
      bounds.x = x;
      bounds.y = y + h + offsetY;
    }
    return bounds;
  }

  hideCopilotPanel() {
    this._copilotPanel?.hide();
    this._copilotPanel = null;
    this._clickOutsideOff = null;
  }

  lockToolbar(disabled: boolean) {
    const legacySlot = this.std.get(EdgelessLegacySlotIdentifier);
    legacySlot.toolbarLocked.next(disabled);
  }

  override render() {
    if (!this._visible) return nothing;

    const rect = this._selectionRect;

    return html`<div class="affine-edgeless-ai">
      <div
        class="copilot-selection-rect"
        style=${styleMap({
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        })}
      ></div>
    </div>`;
  }

  @state()
  private accessor _selectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } = { x: 0, y: 0, width: 0, height: 0 };

  @state()
  private accessor _visible = false;

  @query('.copilot-selection-rect')
  accessor selectionElem!: HTMLDivElement;
}

export const edgelessCopilotWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_EDGELESS_COPILOT_WIDGET,
  literal`${unsafeStatic(AFFINE_EDGELESS_COPILOT_WIDGET)}`
);

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_EDGELESS_COPILOT_WIDGET]: EdgelessCopilotWidget;
  }
}

export * from './constant';
