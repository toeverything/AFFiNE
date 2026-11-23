import {
  EdgelessLegacySlotIdentifier,
  OverlayIdentifier,
} from '@blocksuite/affine-block-surface';
import type { ConnectorElementModel } from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { Vec } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  stdContext,
  storeContext,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { Store } from '@blocksuite/store';
import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { ConnectionOverlay } from '../connector-manager';

const SIZE = 12;
const HALF_SIZE = SIZE / 2;

export class EdgelessConnectorHandle extends WithDisposable(LitElement) {
  static override styles = css`
    .line-controller {
      position: absolute;
      width: ${SIZE}px;
      height: ${SIZE}px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px solid var(--affine-text-emphasis-color);
      background-color: var(--affine-background-primary-color);
      cursor: pointer;
      z-index: 10;
      pointer-events: all;
      /**
       * Fix: pointerEvent stops firing after a short time.
       * When a gesture is started, the browser intersects the touch-action values of the touched element and its ancestors,
       * up to the one that implements the gesture (in other words, the first containing scrolling element)
       * https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
       */
      touch-action: none;
    }
    .line-controller-hidden {
      display: none;
    }
  `;

  private _lastZoom = 1;

  get connectionOverlay() {
    return this.std.get(OverlayIdentifier('connection')) as ConnectionOverlay;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  private _bindEvent() {
    const slots = this.slots;

    this._disposables.addFromEvent(this._startHandler, 'pointerdown', e => {
      slots.elementResizeStart.next();
      this._capPointerDown(e, 'source');
    });
    this._disposables.addFromEvent(this._endHandler, 'pointerdown', e => {
      slots.elementResizeStart.next();
      this._capPointerDown(e, 'target');
    });
    this._disposables.add(() => {
      this.connectionOverlay.clear();
    });
  }

  private _capPointerDown(e: PointerEvent, connection: 'target' | 'source') {
    const { gfx, connector, slots, _disposables } = this;
    e.stopPropagation();
    _disposables.addFromEvent(document, 'pointermove', e => {
      const point = gfx.viewport.toModelCoordFromClientCoord([e.x, e.y]);
      const isStartPointer = connection === 'source';
      const otherSideId = connector[isStartPointer ? 'target' : 'source'].id;

      connector[connection] = this.connectionOverlay.renderConnector(
        point,
        otherSideId ? [otherSideId] : []
      );
      this.requestUpdate();
    });

    _disposables.addFromEvent(document, 'pointerup', () => {
      this.doc.captureSync();
      _disposables.dispose();
      this._disposables = new DisposableGroup();
      this._bindEvent();
      slots.elementResizeEnd.next();
    });
  }

  override firstUpdated() {
    const { gfx } = this;
    const { viewport } = gfx;

    this._lastZoom = viewport.zoom;
    viewport.viewportUpdated.subscribe(() => {
      if (viewport.zoom !== this._lastZoom) {
        this._lastZoom = viewport.zoom;
        this.requestUpdate();
      }
    });

    this._bindEvent();
  }

  override render() {
    const { gfx } = this;
    // path is relative to the element's xywh
    const { path } = this.connector;
    const zoom = gfx.viewport.zoom;
    const startPoint = Vec.subScalar(Vec.mul(path[0], zoom), HALF_SIZE);
    const endPoint = Vec.subScalar(
      Vec.mul(path[path.length - 1], zoom),
      HALF_SIZE
    );
    const startStyle = {
      transform: `translate3d(${startPoint[0]}px,${startPoint[1]}px,0)`,
    };
    const endStyle = {
      transform: `translate3d(${endPoint[0]}px,${endPoint[1]}px,0)`,
    };
    return html`
      <div
        class="line-controller line-start"
        style=${styleMap(startStyle)}
      ></div>
      <div class="line-controller line-end" style=${styleMap(endStyle)}></div>
    `;
  }

  @query('.line-end')
  private accessor _endHandler!: HTMLDivElement;

  @query('.line-start')
  private accessor _startHandler!: HTMLDivElement;

  @property({ attribute: false })
  accessor connector!: ConnectorElementModel;

  @consume({
    context: storeContext,
  })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @consume({
    context: stdContext,
  })
  accessor std!: BlockStdScope;
}
