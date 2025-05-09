import {
  on,
  once,
  requestConnectedFrame,
} from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { css, html, LitElement } from 'lit';
import { query } from 'lit/decorators.js';

/**
 * A scrollbar that is only visible when the user is interacting with it.
 * Append this element to the a container that has a scrollable element. Which means
 * the scrollable element should lay on the same level as the overlay-scrollbar.
 *
 * And the scrollable element should have a `data-scrollable` attribute.
 *
 * Example:
 * ```
 * <div class="container">
 *    <div class="scrollable-element-with-fixed-height" data-scrollable>
 *       <!--.... very long content ....-->
 *    </div>
 *    <overlay-scrollbar></overlay-scrollbar>
 * </div>
 * ```
 *
 * Note:
 * - It only works with vertical scrollbars.
 */
export class OverlayScrollbar extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 10px;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .overlay-handle {
      position: absolute;
      top: 0;
      left: 2px;
      background-color: rgba(0, 0, 0, 0.44);
      border-radius: 3px;
      width: 6px;
    }
  `;

  private readonly _disposable = new DisposableGroup();

  private _handleVisible = false;

  private _scrollable: HTMLElement | null = null;

  private _dragHandle(event: PointerEvent) {
    let startY = event.clientY;

    this._handleVisible = true;

    const dispose = on(document, 'pointermove', evt => {
      this._scroll(evt.clientY - startY);
      startY = evt.clientY;
    });

    once(document, 'pointerup', e => {
      this._handleVisible = false;

      e.stopPropagation();

      setTimeout(() => {
        this._toggleScrollbarVisible(false);
      }, 800);

      dispose();
    });
  }

  private _initWheelHandler() {
    const container = this.parentElement as HTMLElement;

    container.style.contain = 'layout';
    container.style.overflow = 'hidden';

    let hideScrollbarTimeId: null | ReturnType<typeof setTimeout> = null;
    const delayHideScrollbar = () => {
      if (hideScrollbarTimeId) clearTimeout(hideScrollbarTimeId);
      hideScrollbarTimeId = setTimeout(() => {
        this._toggleScrollbarVisible(false);
        hideScrollbarTimeId = null;
      }, 800);
    };

    let scrollable: HTMLElement | null = null;
    this._disposable.addFromEvent(container, 'wheel', event => {
      scrollable = scrollable?.isConnected
        ? scrollable
        : (container.querySelector('[data-scrollable]') as HTMLElement);

      this._scrollable = scrollable;

      if (!scrollable) return;

      // firefox may report a wheel event with deltaMode of value other than 0
      // we just simply multiply it by 16 which is common default line height to get the correct value
      const scrollDistance =
        event.deltaMode === 0 ? event.deltaY : event.deltaY * 16;

      this._scroll(scrollDistance ?? 0);

      delayHideScrollbar();
    });
  }

  private _scroll(scrollDistance: number) {
    const scrollable = this._scrollable!;

    if (!scrollable) return;

    scrollable.scrollBy({
      left: 0,
      top: scrollDistance,
      behavior: 'instant',
    });

    requestConnectedFrame(() => {
      this._updateScrollbarRect(scrollable);
      this._toggleScrollbarVisible(true);
    }, this);
  }

  private _toggleScrollbarVisible(visible: boolean) {
    const vis = visible || this._handleVisible ? '1' : '0';

    if (this.style.opacity !== vis) {
      this.style.opacity = vis;
    }
  }

  private _updateScrollbarRect(rect: {
    scrollTop?: number;
    clientHeight?: number;
    scrollHeight?: number;
  }) {
    if (rect.scrollHeight !== undefined && rect.clientHeight !== undefined) {
      this._handle.style.height = `${(rect.clientHeight / rect.scrollHeight) * 100}%`;
    }

    if (rect.scrollTop !== undefined && rect.scrollHeight !== undefined) {
      this._handle.style.top = `${(rect.scrollTop / rect.scrollHeight) * 100}%`;
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._disposable.dispose();
  }

  override firstUpdated(): void {
    this._initWheelHandler();
  }

  override render() {
    return html`<div
      class="overlay-handle"
      @pointerdown=${this._dragHandle}
    ></div>`;
  }

  @query('.overlay-handle')
  private accessor _handle!: HTMLDivElement;
}
