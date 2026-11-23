import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html, type PropertyValues, type TemplateResult } from 'lit';
import { property, query, queryAll, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

export class Overflow extends SignalWatcher(WithDisposable(ShadowlessElement)) {
  static override styles = css`
    component-overflow {
      display: flex;
      flex-wrap: wrap;
      width: 100%;
      position: relative;
    }

    .component-overflow-item {
    }
    .component-overflow-item.hidden {
      opacity: 0;
      pointer-events: none;
      position: absolute;
    }
  `;

  protected frameId: number | undefined = undefined;

  protected widthList: number[] = [];

  adjustStyle() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }

    this.frameId = requestAnimationFrame(() => {
      this.doAdjustStyle();
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    const resize = new ResizeObserver(() => {
      this.adjustStyle();
    });
    resize.observe(this);
    this.disposables.add(() => {
      resize.unobserve(this);
    });
  }

  protected doAdjustStyle() {
    const moreWidth = this.more.getBoundingClientRect().width;
    this.widthList[this.renderCount] = moreWidth;

    const containerWidth = this.getBoundingClientRect().width;

    let width = 0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      const itemWidth = item.getBoundingClientRect().width;
      // Try to calculate the width occupied by rendering n+1 items;
      // if it exceeds the limit, render n items(in i++ round).
      const totalWidth =
        width + itemWidth + (this.widthList[i + 1] ?? moreWidth);
      if (totalWidth > containerWidth) {
        this.renderCount = i;
        return;
      }
      width += itemWidth;
    }
    this.renderCount = this.items.length;
  }

  override render() {
    return html`
      ${repeat(this.renderItem, (render, index) => {
        const className = classMap({
          'component-overflow-item': true,
          hidden: index >= this.renderCount,
        });
        return html`<div class="${className}">${render()}</div>`;
      })}
      <div class="component-overflow-more">
        ${this.renderMore(this.renderCount)}
      </div>
    `;
  }

  protected override updated(_changedProperties: PropertyValues) {
    super.updated(_changedProperties);
    this.adjustStyle();
  }

  @queryAll(':scope > .component-overflow-item')
  accessor items!: HTMLDivElement[] & NodeList;

  @query(':scope > .component-overflow-more')
  accessor more!: HTMLDivElement;

  @state()
  accessor renderCount = 0;

  @property({ attribute: false })
  accessor renderItem!: Array<() => TemplateResult>;

  @property({ attribute: false })
  accessor renderMore!: (count: number) => TemplateResult;
}
