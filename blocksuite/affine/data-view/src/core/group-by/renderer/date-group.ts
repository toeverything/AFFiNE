import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import type { Group } from '../trait.js';

export class DateGroupView extends SignalWatcher(
    WithDisposable(ShadowlessElement),
) {
    static override styles = css`
    .dv-date-group {
      border-radius: 8px;
      padding: 4px 8px;
      width: max-content;
      cursor: default;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dv-date-group:hover {
      background-color: var(--affine-hover-color);
    }
    .counter {
      flex-shrink: 0;
      min-width: 22px;
      height: 22px;
      border-radius: 4px;
      background: var(--affine-background-secondary-color);
      color: var(--affine-text-secondary-color);
      font-size: var(--data-view-cell-text-size);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;

    @property({ attribute: false })
    accessor group!: Group;

    protected override render() {
        const name = this.group.name$.value;
        const count = this.group.rows.length;
        return html`<div class="dv-date-group">
      <span>${name || 'Ungroups'}</span>
      ${count ? html`<span class="counter">${count}</span>` : ''}
    </div>`;
    }
}
customElements.define('data-view-date-group-view', DateGroupView);
