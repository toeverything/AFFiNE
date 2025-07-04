import type { DocMode } from '@blocksuite/affine-model';
import { HighlightSelection } from '@blocksuite/affine-shared/selection';
import { Bound, deserializeXYWH } from '@blocksuite/global/gfx';
import { WidgetComponent } from '@blocksuite/std';
import { GfxControllerIdentifier, type GfxModel } from '@blocksuite/std/gfx';
import { computed, signal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, nothing, unsafeCSS } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

type Anchor = {
  id: string;
  mode: DocMode;
  highlight: boolean;
};

export const AFFINE_SCROLL_ANCHORING_WIDGET = 'affine-scroll-anchoring-widget';

export class AffineScrollAnchoringWidget extends WidgetComponent {
  static override styles = css`
    :host {
      pointer-events: none;
      position: absolute;
      left: 0px;
      top: 0px;
      transform-origin: left top;
      contain: size layout;
      z-index: 1;

      & .highlight {
        position: absolute;
        box-sizing: border-box;

        &.edgeless {
          border-width: 1.39px;
          border-style: solid;
          border-color: ${unsafeCSS(
            cssVarV2('layer/insideBorder/primaryBorder')
          )};
          box-shadow: var(--affine-active-shadow);
        }

        &.page {
          border-radius: 5px;
          background-color: var(--affine-hover-color);
        }
      }
    }
  `;

  #listened = false;

  readonly #requestUpdateFn = () => this.requestUpdate();

  readonly #resizeObserver: ResizeObserver = new ResizeObserver(
    this.#requestUpdateFn
  );

  anchor$ = signal<Anchor | null>(null);

  anchorBounds$ = signal<Bound | null>(null);

  highlighted$ = computed(() => this.std.selection.find(HighlightSelection));

  #getBoundsInEdgeless() {
    const controller = this.std.get(GfxControllerIdentifier);
    const bounds = this.anchorBounds$.peek();
    if (!bounds) return;

    const { x, y, w, h } = bounds;
    const zoom = controller.viewport.zoom;
    const [vx, vy] = controller.viewport.toViewCoord(x, y);

    return new Bound(vx, vy, w * zoom, h * zoom);
  }

  #getBoundsInPage(id: string) {
    const blockComponent = this.std.view.getBlock(id);
    if (!blockComponent) return;

    const container = this.host;
    const containerRect = container.getBoundingClientRect();
    const { left, top, width, height } = blockComponent.getBoundingClientRect();

    const offsetX = containerRect.left - container.offsetLeft;
    const offsetY = containerRect.top - container.offsetTop;

    return new Bound(left - offsetX, top - offsetY, width, height);
  }

  #moveToAnchorInEdgeless(id: string) {
    const controller = this.std.get(GfxControllerIdentifier);
    const surface = controller.surface;
    if (!surface) return;

    const xywh = controller.getElementById<GfxModel>(id)?.xywh;
    if (!xywh) {
      if (!this.#listened) return;

      const blockUpdatedSubscription =
        this.std.store.slots.blockUpdated.subscribe(v => {
          if (v.type === 'add' && v.id === id) {
            blockUpdatedSubscription.unsubscribe();
            this.#moveToAnchorInEdgeless(id);
          }
        });

      const elementAddedSubscription = surface.elementAdded.subscribe(v => {
        if (v.id === id && v.local === false) {
          elementAddedSubscription.unsubscribe();
          this.#moveToAnchorInEdgeless(id);
        }
      });

      // listen for document updates
      this.disposables.add(blockUpdatedSubscription);
      this.disposables.add(elementAddedSubscription);
      return;
    }

    let bounds = Bound.fromXYWH(deserializeXYWH(xywh));

    const viewport = controller.viewport;
    const blockComponent = this.std.view.getBlock(id);
    const parentComponent = blockComponent?.parentComponent;
    if (parentComponent && parentComponent.flavour === 'affine:note') {
      const { left: x, width: w } = parentComponent.getBoundingClientRect();
      const { top: y, height: h } = blockComponent.getBoundingClientRect();
      const coord = viewport.toModelCoordFromClientCoord([x, y]);
      bounds = new Bound(
        coord[0],
        coord[1],
        w / viewport.zoom,
        h / viewport.zoom
      );
    }

    const { zoom, centerX, centerY } = viewport.getFitToScreenData(
      bounds,
      [20, 20, 100, 20]
    );

    viewport.setZoom(zoom);
    viewport.setCenter(centerX, centerY);

    this.#listened = false;
    this.anchorBounds$.value = bounds;
  }

  #moveToAnchorInPage(id: string) {
    const blockComponent = this.std.view.getBlock(id);
    if (!blockComponent) {
      if (!this.#listened) return;

      // listen for document updates
      const subscription = this.std.store.slots.blockUpdated.subscribe(v => {
        if (v.type === 'add' && v.id === id) {
          subscription.unsubscribe();
          this.#moveToAnchorInPage(id);
        }
      });
      this.disposables.add(subscription);
      return;
    }

    // use `requestAnimationFrame` to better scroll to the target
    // because sometimes it is impossible to scroll to the target
    requestAnimationFrame(() => {
      blockComponent.scrollIntoView({
        behavior: 'instant',
        block: 'center',
      });
    });

    this.#listened = false;
    this.anchorBounds$.value = Bound.fromDOMRect(
      blockComponent.getBoundingClientRect()
    );
  }

  override connectedCallback() {
    super.connectedCallback();

    this.#resizeObserver.observe(this.host);
    this.handleEvent('wheel', this.#requestUpdateFn);
    this.disposables.addFromEvent(window, 'resize', this.#requestUpdateFn);

    // Clears highlight
    this.disposables.addFromEvent(this.host, 'pointerdown', () => {
      this.#listened = false;
      this.anchor$.value = null;
      this.anchorBounds$.value = null;
    });

    // In edgeless
    const controler = this.std.get(GfxControllerIdentifier);
    this.disposables.add(
      controler.viewport.viewportUpdated.subscribe(this.#requestUpdateFn)
    );

    this.disposables.add(
      this.anchor$.subscribe(anchor => {
        if (!anchor) return;

        const { mode, id } = anchor;

        if (mode === 'page') {
          this.#moveToAnchorInPage(id);
          return;
        }

        this.#moveToAnchorInEdgeless(id);
      })
    );

    this.disposables.add(
      this.highlighted$.subscribe(highlighted => {
        if (!highlighted) return;

        const {
          mode,
          blockIds: [bid],
          elementIds: [eid],
          highlight,
        } = highlighted;
        const id = mode === 'page' ? bid : eid || bid;
        if (!id) return;

        // Consumes highlight selection
        this.std.selection.clear(['highlight']);

        this.anchor$.value = { mode, id, highlight };
        this.#listened = true;
      })
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver.disconnect();
  }

  override render() {
    const anchor = this.anchor$.value;
    if (!anchor || !anchor.highlight) return nothing;

    const { mode, id } = anchor;

    const bounds =
      mode === 'page' ? this.#getBoundsInPage(id) : this.#getBoundsInEdgeless();
    if (!bounds) return nothing;

    const classes = { highlight: true, [mode]: true };
    const style = {
      left: `${bounds.x}px`,
      top: `${bounds.y}px`,
      width: `${bounds.w}px`,
      height: `${bounds.h}px`,
    };

    return html`<div
      class=${classMap(classes)}
      style=${styleMap(style)}
    ></div>`;
  }
}
