import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import type { RootBlockModel } from '@blocksuite/affine-model';
import {
  getSelectedRect,
  isTopLevelBlock,
  requestThrottledConnectedFrame,
} from '@blocksuite/affine-shared/utils';
import { MultiCursorDuotoneIcon } from '@blocksuite/icons/lit';
import { WidgetComponent } from '@blocksuite/std';
import { GfxControllerIdentifier, type GfxModel } from '@blocksuite/std/gfx';
import type { UserInfo } from '@blocksuite/store';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { RemoteColorManager } from '../manager/remote-color-manager';

export const AFFINE_EDGELESS_REMOTE_SELECTION_WIDGET =
  'affine-edgeless-remote-selection-widget';

export class EdgelessRemoteSelectionWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    :host {
      pointer-events: none;
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: left top;
      contain: size layout;
      z-index: 1;
    }

    .remote-rect {
      position: absolute;
      top: 0;
      left: 0;
      border-radius: 4px;
      box-sizing: border-box;
      border-width: 3px;
      z-index: 1;
      transform-origin: center center;
    }

    .remote-cursor {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: left top;
      z-index: 1;
    }

    .remote-cursor > svg {
      display: block;
    }

    .remote-username {
      margin-left: 22px;
      margin-top: -2px;

      color: white;

      max-width: 160px;
      padding: 0px 3px;
      border: 1px solid var(--affine-pure-black-20);

      box-shadow: 0px 1px 6px 0px rgba(0, 0, 0, 0.16);
      border-radius: 4px;

      font-size: 12px;
      line-height: 18px;

      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  private _remoteColorManager: RemoteColorManager | null = null;

  private readonly _updateOnElementChange = (
    element: string | { id: string }
  ) => {
    const id = typeof element === 'string' ? element : element.id;

    if (this.isConnected && this.selection.hasRemote(id))
      this._updateRemoteRects();
  };

  private readonly _updateRemoteCursor = () => {
    const remoteCursors: EdgelessRemoteSelectionWidget['_remoteCursors'] =
      new Map();
    const status = this.store.awarenessStore.getStates();

    this.selection.remoteCursorSelectionMap.forEach(
      (cursorSelection, clientId) => {
        remoteCursors.set(clientId, {
          x: cursorSelection.x,
          y: cursorSelection.y,
          user: status.get(clientId)?.user,
        });
      }
    );

    this._remoteCursors = remoteCursors;
  };

  private readonly _updateRemoteRects = () => {
    const { selection } = this;
    const remoteSelectionsMap = selection.remoteSurfaceSelectionsMap;
    const remoteRects: EdgelessRemoteSelectionWidget['_remoteRects'] =
      new Map();

    remoteSelectionsMap.forEach((selections, clientId) => {
      selections.forEach(selection => {
        if (selection.elements.length === 0) return;

        const elements = selection.elements
          .map(id => this.crud.getElementById(id))
          .filter(element => element) as GfxModel[];
        const rect = getSelectedRect(elements);

        if (rect.width === 0 || rect.height === 0) return;

        const { left, top } = rect;
        const [width, height] = [rect.width, rect.height];

        let rotate = 0;
        if (elements.length === 1) {
          const element = elements[0];
          if (!isTopLevelBlock(element)) {
            rotate = element.rotate ?? 0;
          }
        }

        remoteRects.set(clientId, {
          width,
          height,
          borderStyle: 'solid',
          left,
          top,
          rotate,
        });
      });
    });

    this._remoteRects = remoteRects;
  };

  private readonly _updateTransform = requestThrottledConnectedFrame(() => {
    const { translateX, translateY, zoom } = this.gfx.viewport;

    this.style.setProperty('--v-zoom', `${zoom}`);

    this.style.setProperty(
      'transform',
      `translate(${translateX}px, ${translateY}px) scale(var(--v-zoom))`
    );
  }, this);

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  get selection() {
    return this.gfx.selection;
  }

  get surface() {
    return this.gfx.surface;
  }

  override connectedCallback() {
    super.connectedCallback();

    const { _disposables, store } = this;

    if (this.surface) {
      _disposables.add(
        this.surface.elementAdded.subscribe(this._updateOnElementChange)
      );
      _disposables.add(
        this.surface.elementRemoved.subscribe(this._updateOnElementChange)
      );
      _disposables.add(
        this.surface.elementUpdated.subscribe(this._updateOnElementChange)
      );
    }

    _disposables.add(
      store.slots.blockUpdated.subscribe(this._updateOnElementChange)
    );

    _disposables.add(
      this.selection.slots.remoteUpdated.subscribe(this._updateRemoteRects)
    );
    _disposables.add(
      this.selection.slots.remoteCursorUpdated.subscribe(
        this._updateRemoteCursor
      )
    );

    _disposables.add(
      this.gfx.viewport.viewportUpdated.subscribe(() => {
        this._updateTransform();
      })
    );

    this._updateTransform();
    this._updateRemoteRects();

    this._remoteColorManager = new RemoteColorManager(this.std);
  }

  override render() {
    const { _remoteRects, _remoteCursors, _remoteColorManager } = this;
    if (!_remoteColorManager) return nothing;

    const rects = repeat(
      _remoteRects.entries(),
      value => value[0],
      ([id, rect]) =>
        html`<div
          data-client-id=${id}
          class="remote-rect"
          style=${styleMap({
            pointerEvents: 'none',
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            borderStyle: rect.borderStyle,
            borderColor: _remoteColorManager.get(id),
            transform: `translate(${rect.left}px, ${rect.top}px) rotate(${rect.rotate}deg)`,
          })}
        ></div>`
    );

    const cursors = repeat(
      _remoteCursors.entries(),
      value => value[0],
      ([id, cursor]) => {
        return html`<div
          data-client-id=${id}
          class="remote-cursor"
          style=${styleMap({
            pointerEvents: 'none',
            transform: `translate(${cursor.x}px, ${cursor.y}px) scale(calc(1/var(--v-zoom)))`,
            color: _remoteColorManager.get(id),
          })}
        >
          ${MultiCursorDuotoneIcon({
            width: '24px',
            height: '24px',
            style: `fill: ${_remoteColorManager.get(id)}; stroke: ${_remoteColorManager.get(id)};`,
          })}
          <div
            class="remote-username"
            style=${styleMap({
              backgroundColor: _remoteColorManager.get(id),
            })}
          >
            ${cursor.user?.name ?? 'Unknown'}
          </div>
        </div>`;
      }
    );

    return html`
      <div class="affine-edgeless-remote-selection">${rects}${cursors}</div>
    `;
  }

  @state()
  private accessor _remoteCursors: Map<
    number,
    {
      x: number;
      y: number;
      user?: UserInfo | undefined;
    }
  > = new Map();

  @state()
  private accessor _remoteRects: Map<
    number,
    {
      width: number;
      height: number;
      borderStyle: string;
      left: number;
      top: number;
      rotate: number;
    }
  > = new Map();
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_EDGELESS_REMOTE_SELECTION_WIDGET]: EdgelessRemoteSelectionWidget;
  }
}
