import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { BlockComponent } from '@blocksuite/std';
import { generateKeyBetweenV2 } from '@blocksuite/std/gfx';
import { css, html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { EdgelessFrameManagerIdentifier } from '../frame-manager';

export class EdgelessFrameOrderMenu extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = css`
    :host {
      position: relative;
    }
    .edgeless-frame-order-items-container {
      max-height: 281px;
      border-radius: 8px;
      padding: 8px;
      background: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-menu-shadow);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .edgeless-frame-order-items-container.embed {
      padding: 0;
      background: unset;
      box-shadow: unset;
      border-radius: 0;
    }

    .item {
      box-sizing: border-box;
      width: 256px;
      border-radius: 4px;
      padding: 4px;
      display: flex;
      gap: 4px;
      align-items: center;
      cursor: grab;
    }

    .draggable:hover {
      background-color: var(--affine-hover-color);
    }

    .item:hover .drag-indicator {
      opacity: 1;
    }

    .drag-indicator {
      cursor: pointer;
      width: 4px;
      height: 12px;
      border-radius: 1px;
      opacity: 0.2;
      background: var(--affine-placeholder-color);
      margin-right: 2px;
    }

    .title {
      font-size: 14px;
      font-weight: 400;
      height: 22px;
      line-height: 22px;
      color: var(--affine-text-primary-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .clone {
      visibility: hidden;
      position: absolute;
      z-index: 1;
      left: 8px;
      height: 30px;
      border: 1px solid var(--affine-border-color);
      box-shadow: var(--affine-menu-shadow);
      background-color: var(--affine-white);
      pointer-events: none;
    }

    .indicator-line {
      visibility: hidden;
      position: absolute;
      z-index: 1;
      left: 8px;
      background-color: var(--affine-primary-color);
      height: 1px;
      width: 90%;
    }
  `;

  get crud() {
    return this.edgeless.std.get(EdgelessCRUDIdentifier);
  }

  private get _frameMgr() {
    return this.edgeless.std.get(EdgelessFrameManagerIdentifier);
  }

  private get _frames() {
    return this._frameMgr.frames;
  }

  private _bindEvent() {
    const { _disposables } = this;

    _disposables.addFromEvent(this._container, 'wheel', e => {
      e.stopPropagation();
    });

    _disposables.addFromEvent(this._container, 'pointerdown', e => {
      const ele = e.target as HTMLElement;
      const draggable = ele.closest('.draggable');
      if (!draggable) return;
      const clone = this._clone;
      const indicatorLine = this._indicatorLine;
      clone.style.visibility = 'visible';

      const rect = draggable.getBoundingClientRect();

      const index = Number(draggable.getAttribute('index'));
      this._curIndex = index;
      let newIndex = -1;

      const containerRect = this._container.getBoundingClientRect();
      const start = containerRect.top + 8;
      const end = containerRect.bottom;

      const shiftX = e.clientX - rect.left;
      const shiftY = e.clientY - rect.top;
      function moveAt(x: number, y: number) {
        clone.style.left = x - containerRect.left - shiftX + 'px';
        clone.style.top = y - containerRect.top - shiftY + 'px';
      }

      function isInsideContainer(e: PointerEvent) {
        return e.clientY >= start && e.clientY <= end;
      }
      moveAt(e.clientX, e.clientY);

      this._disposables.addFromEvent(document, 'pointermove', e => {
        indicatorLine.style.visibility = 'visible';
        moveAt(e.clientX, e.clientY);
        if (isInsideContainer(e)) {
          const relativeY = e.pageY + this._container.scrollTop - start;
          let top = 0;
          if (relativeY < rect.height / 2) {
            newIndex = 0;
            top = this.embed ? -2 : 4;
          } else {
            newIndex = Math.ceil(
              (relativeY - rect.height / 2) / (rect.height + 10)
            );
            top =
              (this.embed ? -2 : 7.5) +
              newIndex * rect.height +
              (newIndex - 0.5) * 4;
          }

          indicatorLine.style.top = top - this._container.scrollTop + 'px';
          return;
        }
        newIndex = -1;
      });

      this._disposables.addFromEvent(document, 'pointerup', () => {
        clone.style.visibility = 'hidden';
        indicatorLine.style.visibility = 'hidden';
        if (
          newIndex >= 0 &&
          newIndex <= this._frames.length &&
          newIndex !== index &&
          newIndex !== index + 1
        ) {
          const frameMgr = this._frameMgr;
          // Legacy compatibility
          frameMgr.refreshLegacyFrameOrder();

          const before =
            this._frames[newIndex - 1]?.props.presentationIndex || null;
          const after = this._frames[newIndex]?.props.presentationIndex || null;

          const frame = this._frames[index];

          this.crud.updateElement(frame.id, {
            presentationIndex: generateKeyBetweenV2(before, after),
          });
          this.edgeless.store.captureSync();

          this.requestUpdate();
        }
        this._disposables.dispose();
        this._disposables = new DisposableGroup();
        this._bindEvent();
      });
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disposables.dispose();
  }

  override firstUpdated() {
    this._bindEvent();
  }

  override render() {
    const frame = this._frames[this._curIndex];

    return html`
      <div
        class="edgeless-frame-order-items-container ${this.embed
          ? 'embed'
          : ''}"
        @click=${(e: MouseEvent) => e.stopPropagation()}
      >
        ${repeat(
          this._frames,
          frame => frame.id,
          (frame, index) => html`
            <div class="item draggable" id=${frame.id} index=${index}>
              <div class="drag-indicator"></div>
              <div class="title">${frame.props.title.toString()}</div>
            </div>
          `
        )}
        <div class="indicator-line"></div>
        <div class="clone item">
          ${frame
            ? html`<div class="drag-indicator"></div>
                <div class="index">${this._curIndex + 1}</div>
                <div class="title">${frame.props.title.toString()}</div>`
            : nothing}
        </div>
      </div>
    `;
  }

  @query('.clone')
  private accessor _clone!: HTMLDivElement;

  @query('.edgeless-frame-order-items-container')
  private accessor _container!: HTMLDivElement;

  @state()
  private accessor _curIndex = -1;

  @query('.indicator-line')
  private accessor _indicatorLine!: HTMLDivElement;

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @property({ attribute: false })
  accessor embed = false;
}
