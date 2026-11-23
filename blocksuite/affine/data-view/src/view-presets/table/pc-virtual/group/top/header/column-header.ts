import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css } from '@emotion/css';
import { nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { renderUniLit } from '../../../../../../core';
import { LEFT_TOOL_BAR_WIDTH } from '../../../../consts';
import { cellDivider } from '../../../../styles';
import type { VirtualTableViewUILogic } from '../../../table-view-ui-logic';
import * as styles from './column-header-css';
const leftBarStyle = css({
  width: LEFT_TOOL_BAR_WIDTH,
});
export class VirtualTableHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  private readonly _onAddColumn = (e: MouseEvent) => {
    if (this.readonly) return;
    const ele = e.currentTarget as HTMLElement;
    popMenu(popupTargetFromElement(ele), {
      options: {
        title: {
          text: 'Property type',
        },
        items: [
          menu.group({
            items: this.tableViewManager.propertyMetas$.value.map(config => {
              return menu.action({
                name: config.config.name,
                prefix: renderUniLit(config.renderer.icon),
                select: () => {
                  const id = this.tableViewManager.propertyAdd('end', {
                    type: config.type,
                    name: config.config.name,
                  });
                  if (id) {
                    requestAnimationFrame(() => {
                      ele.scrollIntoView({
                        block: 'nearest',
                        inline: 'nearest',
                      });
                      this.openPropertyMenuById(id);
                    });
                  }
                },
              });
            }),
          }),
        ],
      },
    });
  };

  openPropertyMenuById = (id: string) => {
    const column = this.querySelectorAll('virtual-database-header-column');
    for (const item of column) {
      if (item.dataset.columnId === id) {
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        item.editTitle();
        return;
      }
    }
  };

  private get readonly() {
    return this.tableViewManager.readonly$.value;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(styles.columnHeaderContainer);
  }

  override render() {
    return html`
      <div class="${styles.columnHeader} database-row">
        ${this.readonly ? nothing : html` <div class="${leftBarStyle}"></div>`}
        ${repeat(
          this.tableViewManager.properties$.value,
          column => column.id,
          (column, index) => {
            const style = styleMap({
              width: `${column.width$.value}px`,
              border: index === 0 ? 'none' : undefined,
            });
            return html`
              <virtual-database-header-column
                style="${style}"
                data-column-id="${column.id}"
                data-column-index="${index}"
                class="${styles.column} ${styles.cell}"
                .column="${column}"
                .tableViewLogic="${this.tableViewLogic}"
              ></virtual-database-header-column>
              <div class="${cellDivider}" style="height: auto;"></div>
            `;
          }
        )}
        <div
          @click="${this._onAddColumn}"
          class="${styles.headerAddColumnButton}"
        >
          ${PlusIcon()}
        </div>
        <div class="scale-div" style="width: 1px;height: 1px;"></div>
      </div>
    `;
  }

  @query('.scale-div')
  accessor scaleDiv!: HTMLDivElement;

  @property({ attribute: false })
  accessor tableViewLogic!: VirtualTableViewUILogic;

  get tableViewManager() {
    return this.tableViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-table-header': VirtualTableHeader;
  }
}
