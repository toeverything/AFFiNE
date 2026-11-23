import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { css, html } from 'lit';

import { BaseGroup } from './base.js';

export class StringGroupView extends BaseGroup<string, NonNullable<unknown>> {
  static override styles = css`
    .data-view-group-title-string-view {
      border-radius: 8px;
      padding: 4px 8px;
      width: max-content;
      cursor: pointer;
    }

    .data-view-group-title-string-view:hover {
      background-color: var(--affine-hover-color);
    }
  `;

  private readonly _click = () => {
    if (this.readonly) {
      return;
    }
    popMenu(popupTargetFromElement(this), {
      options: {
        items: [
          menu.input({
            initialValue: this.value ?? '',
            onComplete: text => {
              this.updateValue?.(text);
            },
          }),
        ],
      },
    });
  };

  protected override render(): unknown {
    if (!this.value) {
      const displayName = `No ${this.group.property.name$.value}`;
      return html` <div>${displayName}</div>`;
    }
    return html` <div
      @click="${this._click}"
      class="data-view-group-title-string-view"
    >
      ${this.value}
    </div>`;
  }
}
