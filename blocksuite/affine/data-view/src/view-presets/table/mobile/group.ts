import {
  menu,
  popFilterableSimpleMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { GroupTitle } from '../../../core/group-by/group-title.js';
import type { Group } from '../../../core/group-by/trait.js';
import type { Row } from '../../../core/index.js';
import { LEFT_TOOL_BAR_WIDTH } from '../consts.js';
import type { MobileTableViewUILogic } from './table-view-ui-logic.js';

const styles = css`
  .data-view-table-group-add-row {
    display: flex;
    width: 100%;
    height: 28px;
    position: relative;
    z-index: 0;
    cursor: pointer;
    transition: opacity 0.2s ease-in-out;
    padding: 4px 8px;
    border-bottom: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
  }

  .data-view-table-group-add-row-button {
    position: sticky;
    left: ${8 + LEFT_TOOL_BAR_WIDTH}px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    user-select: none;
    font-size: 12px;
    line-height: 20px;
    color: var(--affine-text-secondary-color);
  }
`;

export class MobileTableGroup extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly clickAddRow = () => {
    this.view.rowAdd('end', this.group?.key);
    this.requestUpdate();
  };

  private readonly clickAddRowInStart = () => {
    this.view.rowAdd('start', this.group?.key);
    this.requestUpdate();
  };

  private readonly clickGroupOptions = (e: MouseEvent) => {
    const group = this.group;
    if (!group) {
      return;
    }
    const ele = e.currentTarget as HTMLElement;
    popFilterableSimpleMenu(popupTargetFromElement(ele), [
      menu.action({
        name: 'Ungroup',
        hide: () => group.value == null,
        select: () => {
          group.rows.forEach(row => {
            group.manager.removeFromGroup(row.rowId, group.key);
          });
        },
      }),
      menu.action({
        name: 'Delete Cards',
        select: () => {
          this.view.rowsDelete(group.rows.map(row => row.rowId));
          this.requestUpdate();
        },
      }),
    ]);
  };

  private readonly renderGroupHeader = () => {
    if (!this.group) {
      return null;
    }
    return html`
      <div
        style="position: sticky;left: 0;width: max-content;padding: 6px 0;margin-bottom: 4px;display:flex;align-items:center;gap: 12px;max-width: 400px"
      >
        ${GroupTitle(this.group, {
          readonly: this.view.readonly$.value,
          clickAdd: this.clickAddRowInStart,
          clickOps: this.clickGroupOptions,
        })}
      </div>
    `;
  };

  get rows() {
    return this.group?.rows ?? this.view.rows$.value;
  }

  private renderRows(rows: Row[]) {
    return html`
      <mobile-table-header
        .renderGroupHeader="${this.renderGroupHeader}"
        .tableViewManager="${this.view}"
      ></mobile-table-header>
      <div class="mobile-affine-table-body">
        ${repeat(
          rows,
          row => row.rowId,
          (row, idx) => {
            return html` <mobile-table-row
              data-row-index="${idx}"
              data-row-id="${row.rowId}"
              .tableViewLogic="${this.tableViewLogic}"
              .rowId="${row.rowId}"
              .rowIndex="${idx}"
            ></mobile-table-row>`;
          }
        )}
      </div>
      ${this.view.readonly$.value
        ? null
        : html` <div
            class="data-view-table-group-add-row dv-hover"
            @click="${this.clickAddRow}"
          >
            <div
              class="data-view-table-group-add-row-button dv-icon-16"
              data-test-id="affine-database-add-row-button"
              role="button"
            >
              ${PlusIcon()}<span style="font-size: 12px">New Record</span>
            </div>
          </div>`}
    `;
  }

  override render() {
    return this.renderRows(this.rows);
  }

  @property({ attribute: false })
  accessor group: Group | undefined = undefined;

  @property({ attribute: false })
  accessor tableViewLogic!: MobileTableViewUILogic;

  get view() {
    return this.tableViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-table-group': MobileTableGroup;
  }
}
