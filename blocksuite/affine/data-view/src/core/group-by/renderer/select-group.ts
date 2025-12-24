import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { css, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { selectOptionColors } from '../../component/tags/colors.js';
import type { SelectTag } from '../../logical/index.js';
import { BaseGroup } from './base.js';

export class SelectGroupView extends BaseGroup<
  string,
  {
    options: SelectTag[];
  }
> {
  static override styles = css`
    data-view-group-title-select-view {
      overflow: hidden;
    }

    .data-view-group-title-select-view {
      width: 100%;
      cursor: pointer;
    }

    .data-view-group-title-select-view.readonly {
      cursor: inherit;
    }

    .tag {
      padding: 0 8px;
      border-radius: 4px;
      font-size: var(--data-view-cell-text-size);
      line-height: var(--data-view-cell-text-line-height);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  private readonly _click = (e: MouseEvent) => {
    if (this.readonly) {
      return;
    }
    e.stopPropagation();
    popMenu(popupTargetFromElement(this), {
      options: {
        items: [
          menu.input({
            initialValue: this.tag?.value ?? '',
            onChange: text => {
              this.updateTag({ value: text });
            },
          }),
          ...selectOptionColors.map(({ color, name }) => {
            const styles = styleMap({
              backgroundColor: color,
              borderRadius: '50%',
              width: '20px',
              height: '20px',
            });
            return menu.action({
              name: name,
              isSelected: this.tag?.color === color,
              prefix: html` <div style=${styles}></div>`,
              select: () => {
                this.updateTag({ color });
              },
            });
          }),
        ],
      },
    });
  };

  get tag() {
    return this.data.options?.find(v => v.id === this.value);
  }

  protected override render(): unknown {
    const tag = this.tag;
    if (!tag) {
      const displayName = `No ${this.group.property.name$.value}`;
      return html` <div
        style="font-size: 14px;color: var(--affine-text-primary-color);line-height: 22px;"
      >
        ${displayName}
      </div>`;
    }
    const style = styleMap({
      backgroundColor: tag.color,
    });
    const classList = classMap({
      'data-view-group-title-select-view': true,
      readonly: this.readonly,
    });
    return html` <div @click="${this._click}" class="${classList}">
      <div class="tag" style="${style}">${tag.value}</div>
    </div>`;
  }

  updateTag(tag: Partial<SelectTag>) {
    this.updateData?.({
      ...this.data,
      options: this.data.options.map(v => {
        if (v.id === this.value) {
          return {
            ...v,
            ...tag,
          };
        }
        return v;
      }),
    });
  }
}
