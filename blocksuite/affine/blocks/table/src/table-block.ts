import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import type { TableBlockModel } from '@blocksuite/affine-model';
import { EDGELESS_TOP_CONTENTEDITABLE_SELECTOR } from '@blocksuite/affine-shared/consts';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { VirtualPaddingController } from '@blocksuite/affine-shared/utils';
import { IS_MOBILE } from '@blocksuite/global/env';
import type { BlockComponent } from '@blocksuite/std';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { ref } from 'lit/directives/ref.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { SelectionController } from './selection-controller';
import {
  rowStyle,
  table,
  tableContainer,
  tableWrapper,
} from './table-block-css';
import { TableDataManager } from './table-data-manager';

export const TableBlockComponentName = 'affine-table';
export class TableBlockComponent extends CaptionedBlockComponent<TableBlockModel> {
  private _dataManager: TableDataManager | null = null;

  get dataManager(): TableDataManager {
    if (!this._dataManager) {
      this._dataManager = new TableDataManager(this.model);
    }
    return this._dataManager;
  }

  selectionController = new SelectionController(this);

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
    this.style.position = 'relative';
  }

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(
        EDGELESS_TOP_CONTENTEDITABLE_SELECTOR
      );
    }
    return this.rootComponent;
  }

  private readonly virtualPaddingController: VirtualPaddingController =
    new VirtualPaddingController(this);

  table$ = signal<HTMLTableElement>();

  public getScale(): number {
    const table = this.table$.value;
    if (!table) return 1;
    return table.getBoundingClientRect().width / table.offsetWidth;
  }

  private readonly getRootRect = () => {
    const table = this.table$.value;
    if (!table) return;
    return table.getBoundingClientRect();
  };

  private readonly getRowRect = (rowId: string) => {
    const row = this.querySelector(`tr[data-row-id="${rowId}"]`);
    const rootRect = this.getRootRect();
    if (!row || !rootRect) return;
    const rect = row.getBoundingClientRect();
    const scale = this.getScale();
    return {
      top: (rect.top - rootRect.top) / scale,
      left: (rect.left - rootRect.left) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    };
  };

  private readonly getColumnRect = (columnId: string) => {
    const columns = this.querySelectorAll(`td[data-column-id="${columnId}"]`);
    const rootRect = this.getRootRect();
    if (!rootRect) return;
    const firstRect = columns.item(0)?.getBoundingClientRect();
    const lastRect = columns.item(columns.length - 1)?.getBoundingClientRect();
    if (!firstRect || !lastRect) return;
    const scale = this.getScale();
    return {
      top: (firstRect.top - rootRect.top) / scale,
      left: (firstRect.left - rootRect.left) / scale,
      width: firstRect.width / scale,
      height: (lastRect.bottom - firstRect.top) / scale,
    };
  };

  private readonly getAreaRect = (
    rowStartIndex: number,
    rowEndIndex: number,
    columnStartIndex: number,
    columnEndIndex: number
  ) => {
    const rootRect = this.getRootRect();
    const rows = this.querySelectorAll('tr');
    const startRow = rows.item(rowStartIndex);
    const endRow = rows.item(rowEndIndex);
    if (!startRow || !endRow || !rootRect) return;

    const startCells = startRow.querySelectorAll('td');
    const endCells = endRow.querySelectorAll('td');
    const startCell = startCells.item(columnStartIndex);
    const endCell = endCells.item(columnEndIndex);
    if (!startCell || !endCell) return;

    const startRect = startCell.getBoundingClientRect();
    const endRect = endCell.getBoundingClientRect();
    const scale = this.getScale();

    return {
      top: (startRect.top - rootRect.top) / scale,
      left: (startRect.left - rootRect.left) / scale,
      width: (endRect.right - startRect.left) / scale,
      height: (endRect.bottom - startRect.top) / scale,
    };
  };

  override renderBlock() {
    const rows = this.dataManager.uiRows$.value;
    const columns = this.dataManager.uiColumns$.value;
    const virtualPadding = this.virtualPaddingController.virtualPadding$.value;
    return html`
      <div
        contenteditable="false"
        class=${tableContainer}
        style=${styleMap({
          marginLeft: `-${virtualPadding + 10}px`,
          marginRight: `-${virtualPadding}px`,
          position: 'relative',
        })}
      >
        <div
          style=${styleMap({
            paddingLeft: `${virtualPadding}px`,
            paddingRight: `${virtualPadding}px`,
            marginLeft:
              !this.model.props.textAlign$.value ||
              this.model.props.textAlign$?.value === 'left'
                ? undefined
                : 'auto',
            marginRight:
              !this.model.props.textAlign$.value ||
              this.model.props.textAlign$?.value === 'right'
                ? undefined
                : 'auto',
            width: 'max-content',
          })}
        >
          <table class=${tableWrapper} ${ref(this.table$)}>
            <tbody class=${table}>
              ${repeat(
                rows,
                row => row.rowId,
                (row, rowIndex) => {
                  return html`
                    <tr class=${rowStyle} data-row-id=${row.rowId}>
                      ${repeat(
                        columns,
                        column => column.columnId,
                        (column, columnIndex) => {
                          const cell = this.dataManager.getCell(
                            row.rowId,
                            column.columnId
                          );
                          return html`
                            <affine-table-cell
                              style="display: contents;"
                              .rowIndex=${rowIndex}
                              .columnIndex=${columnIndex}
                              .row=${row}
                              .column=${column}
                              .text=${cell?.text}
                              .dataManager=${this.dataManager}
                              .selectionController=${this.selectionController}
                            ></affine-table-cell>
                          `;
                        }
                      )}
                    </tr>
                  `;
                }
              )}
            </tbody>
            ${IS_MOBILE || this.dataManager.readonly$.value
              ? nothing
              : html`<affine-table-add-button
                  style="display: contents;"
                  .dataManager=${this.dataManager}
                ></affine-table-add-button>`}
            ${html`<affine-table-selection-layer
              style="display: contents;"
              .selectionController=${this.selectionController}
              .getRowRect=${this.getRowRect}
              .getColumnRect=${this.getColumnRect}
              .getAreaRect=${this.getAreaRect}
            ></affine-table-selection-layer>`}
          </table>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [TableBlockComponentName]: TableBlockComponent;
  }
}
