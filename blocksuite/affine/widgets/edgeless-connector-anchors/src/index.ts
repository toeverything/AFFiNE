import { OverlayIdentifier } from '@blocksuite/affine-block-surface';
import {
  type ConnectionOverlay,
  ConnectorTool,
} from '@blocksuite/affine-gfx-connector';
import { DEFAULT_CONNECTOR_MODE } from '@blocksuite/affine-model';
import { EditPropsStore } from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import type { IVec } from '@blocksuite/global/gfx';
import { Vec } from '@blocksuite/global/gfx';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { GfxControllerIdentifier, type GfxModel } from '@blocksuite/std/gfx';
import { css, html } from 'lit';
import { state } from 'lit/decorators.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

export const AFFINE_EDGELESS_CONNECTOR_ANCHORS_WIDGET =
  'affine-edgeless-connector-anchors-widget';

export class EdgelessConnectorAnchorsWidget extends WidgetComponent {
  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
  `;

  @state()
  private accessor _dragging = false;

  private _hoveredElement: GfxModel | null = null;

  private _hoverHighlight: IVec | null = null;

  private _hoverConnection: { id?: string; position?: IVec } | null = null;

  private _pendingPointer: IVec | null = null;
  private _hoverRafId: number | null = null;

  private _touchAnchorsVisible = false;

  private _touchLongPressTimer: number | null = null;

  private _touchLongPressStart: IVec | null = null;

  private _cancelTouchLongPress() {
    if (this._touchLongPressTimer !== null) {
      clearTimeout(this._touchLongPressTimer);
      this._touchLongPressTimer = null;
    }
    this._touchLongPressStart = null;
  }

  private _updateHoverFromViewPoint(viewPoint: IVec) {
    const gfx = this._gfx;
    const [x, y] = gfx.viewport.toModelCoord(viewPoint[0], viewPoint[1]);
    const result = this._overlay?.renderConnector([x, y]);
    if (!result?.id) {
      this._clearOverlay();
      return false;
    }

    const element = gfx.getElementById(result.id) as GfxModel | null;
    if (!element || ('type' in element && element.type === 'connector')) {
      this._clearOverlay();
      return false;
    }

    this._hoveredElement = element;
    this._hoverHighlight = this._overlay?.highlightPoint ?? null;
    this._hoverConnection = result ?? null;
    return Boolean(this._hoverHighlight);
  }

  private _clearOverlay() {
    this._touchAnchorsVisible = false;
    this._hoveredElement = null;
    this._hoverHighlight = null;
    this._hoverConnection = null;
    this._overlay?.clear();
  }

  private get _overlay() {
    return this.std.get(OverlayIdentifier('connection')) as ConnectionOverlay;
  }

  private get _gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  override firstUpdated() {
    const { _disposables } = this;
    const gfx = this._gfx;
    const std = this.std;
    const edgeless = std.view.getBlock(std.store.root!.id);
    if (!edgeless?.host?.event) {
      return;
    }

    _disposables.add(
      edgeless.host.event.add('dragStart', () => {
        this._dragging = true;
        this._clearOverlay();
      })
    );

    _disposables.add(
      edgeless.host.event.add('dragEnd', () => {
        this._dragging = false;
        this._clearOverlay();
      })
    );

    _disposables.add(
      edgeless.host.event.add('pointerMove', ctx => {
        if (this._dragging) return;

        const state = ctx.get('pointerState');
        const isTouch = state.raw.pointerType === 'touch';

        if (isTouch) {
          const start = this._touchLongPressStart;
          if (start) {
            const dist = Vec.dist([state.x, state.y], start);
            if (dist > 8) {
              this._cancelTouchLongPress();
            }
          }

          if (!this._touchAnchorsVisible) {
            return;
          }
        }

        const tool = gfx.tool.currentTool$.peek();
        if (tool && !['default', 'connector'].includes(tool.toolName)) {
          this._clearOverlay();
          return;
        }

        const [x, y] = gfx.viewport.toModelCoord(state.x, state.y);
        this._pendingPointer = [x, y];
        if (this._hoverRafId) return;
        this._hoverRafId = requestAnimationFrame(() => {
          this._hoverRafId = null;
          const pending = this._pendingPointer;
          if (!pending) return;
          this._pendingPointer = null;

          const result = this._overlay?.renderConnector(pending);
          if (!result?.id) {
            this._clearOverlay();
            return;
          }

          const element = gfx.getElementById(result.id) as GfxModel | null;
          if (!element || ('type' in element && element.type === 'connector')) {
            this._clearOverlay();
            return;
          }

          this._hoveredElement = element;
          this._hoverHighlight = this._overlay?.highlightPoint ?? null;
          this._hoverConnection = result ?? null;
        });
      })
    );

    _disposables.add(
      edgeless.host.event.add('pointerDown', ctx => {
        if (this._dragging) {
          return;
        }
        const state = ctx.get('pointerState');
        const isTouch = state.raw.pointerType === 'touch';

        if (isTouch) {
          if (!this._touchAnchorsVisible) {
            this._cancelTouchLongPress();
            this._touchLongPressStart = [state.x, state.y];
            this._touchLongPressTimer = window.setTimeout(() => {
              this._touchLongPressTimer = null;
              const start = this._touchLongPressStart;
              if (!start || this._dragging) return;
              this._touchAnchorsVisible = this._updateHoverFromViewPoint(start);
            }, 420);
            return;
          }

          if (!this._updateHoverFromViewPoint([state.x, state.y])) {
            this._clearOverlay();
            return;
          }
        }

        if (gfx.tool.currentToolName$.peek() === 'connector') {
          const connectorTool = gfx.tool.get(ConnectorTool) as unknown as {
            _connector?: unknown;
          };
          if (connectorTool?._connector) {
            return;
          }
        }
        if (!this._hoveredElement || !this._hoverHighlight) return;

        const highlightView = gfx.viewport.toViewCoord(
          this._hoverHighlight[0],
          this._hoverHighlight[1]
        );
        const dist = Vec.dist([state.x, state.y], highlightView);
        if (dist > (isTouch ? 14 : 8)) {
          if (isTouch) {
            this._clearOverlay();
          }
          return;
        }

        stopPropagation(state.raw);

        const lastMode =
          std.get(EditPropsStore).lastProps$.value.connector.mode ??
          DEFAULT_CONNECTOR_MODE;
        gfx.tool.setTool(ConnectorTool, { mode: lastMode });
        const tool = gfx.tool.get(ConnectorTool);
        const anchor = this._hoverConnection;
        if (anchor?.position) {
          tool.quickConnectFromAnchor(
            [state.x, state.y],
            this._hoveredElement,
            anchor.position as IVec
          );
        } else {
          if (isTouch) {
            this._clearOverlay();
            return;
          }
          tool.quickConnect([state.x, state.y], this._hoveredElement);
        }
        this._dragging = true;
      })
    );

    _disposables.add(
      edgeless.host.event.add('pointerUp', () => {
        this._cancelTouchLongPress();
        this._dragging = false;
      })
    );
  }

  override disconnectedCallback() {
    this._cancelTouchLongPress();
    super.disconnectedCallback();
  }

  override render() {
    return html``;
  }
}

export const connectorAnchorsWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_EDGELESS_CONNECTOR_ANCHORS_WIDGET,
  literal`${unsafeStatic(AFFINE_EDGELESS_CONNECTOR_ANCHORS_WIDGET)}`
);

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-connector-anchors-widget': EdgelessConnectorAnchorsWidget;
  }
}
