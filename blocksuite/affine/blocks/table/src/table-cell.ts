import {
  menu,
  popMenu,
  type PopupTarget,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { TextBackgroundDuotoneIcon } from '@blocksuite/affine-components/icons';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import type { TableColumn, TableRow } from '@blocksuite/affine-model';
import { RichText } from '@blocksuite/affine-rich-text';
import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { getViewportElement } from '@blocksuite/affine-shared/utils';
import { IS_MAC } from '@blocksuite/global/env';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  ArrowDownBigIcon,
  ArrowLeftBigIcon,
  ArrowRightBigIcon,
  ArrowUpBigIcon,
  CloseIcon,
  ColorPickerIcon,
  CopyIcon,
  DeleteIcon,
  DuplicateIcon,
  InsertAboveIcon,
  InsertBelowIcon,
  InsertLeftIcon,
  InsertRightIcon,
  PasteIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Text } from '@blocksuite/store';
import { computed, effect, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';

import { colorList } from './color';
import { ColumnMaxWidth, DefaultColumnWidth } from './consts';
import type { SelectionController } from './selection-controller';
import {
  type TableAreaSelection,
  TableSelectionData,
} from './selection-schema';
import type { TableBlockComponent } from './table-block';
import {
  cellContainerStyle,
  columnLeftIndicatorStyle,
  columnOptionsCellStyle,
  columnOptionsStyle,
  columnRightIndicatorStyle,
  rowBottomIndicatorStyle,
  rowOptionsCellStyle,
  rowOptionsStyle,
  rowTopIndicatorStyle,
  threePointerIconDotStyle,
  threePointerIconStyle,
} from './table-cell-css';
import type { TableDataManager } from './table-data-manager';
export const TableCellComponentName = 'affine-table-cell';
export class TableCell extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor text: Text | undefined = undefined;

  get readonly() {
    return this.dataManager.readonly$.value;
  }

  @property({ attribute: false })
  accessor dataManager!: TableDataManager;

  @query('rich-text')
  accessor richText: RichText | null = null;

  @property({ type: Number })
  accessor rowIndex = 0;

  @property({ type: Number })
  accessor columnIndex = 0;

  @property({ attribute: false })
  accessor row: TableRow | undefined = undefined;

  @property({ attribute: false })
  accessor column: TableColumn | undefined = undefined;

  @property({ attribute: false })
  accessor selectionController!: SelectionController;

  @property({ attribute: false })
  accessor height: number | undefined;

  get hoverColumnIndex$() {
    return this.dataManager.hoverColumnIndex$;
  }
  get hoverRowIndex$() {
    return this.dataManager.hoverRowIndex$;
  }
  get inlineManager() {
    return this.closest<TableBlockComponent>('affine-table')?.std.get(
      DefaultInlineManagerExtension.identifier
    );
  }

  get topContenteditableElement() {
    return this.closest<TableBlockComponent>('affine-table')
      ?.topContenteditableElement;
  }

  openColumnOptions(
    target: PopupTarget,
    column: TableColumn,
    columnIndex: number
  ) {
    this.selectionController.setSelected({
      type: 'column',
      columnId: column.columnId,
    });
    popMenu(target, {
      options: {
        onClose: () => {
          this.selectionController.setSelected(undefined);
        },
        items: [
          menu.group({
            items: [
              menu.subMenu({
                name: 'Background color',
                prefix: ColorPickerIcon(),
                options: {
                  items: [
                    { name: 'Default', color: undefined },
                    ...colorList,
                  ].map(item =>
                    menu.action({
                      prefix: html`<div
                        style="color: ${item.color ??
                        cssVarV2.layer.background
                          .primary};display: flex;align-items: center;justify-content: center;"
                      >
                        ${TextBackgroundDuotoneIcon}
                      </div>`,
                      name: item.name,
                      isSelected: column.backgroundColor === item.color,
                      select: () => {
                        this.dataManager.setColumnBackgroundColor(
                          column.columnId,
                          item.color
                        );
                      },
                    })
                  ),
                },
              }),
              ...(column.backgroundColor
                ? [
                    menu.action({
                      name: 'Clear column style',
                      prefix: CloseIcon(),
                      select: () => {
                        this.dataManager.setColumnBackgroundColor(
                          column.columnId,
                          undefined
                        );
                      },
                    }),
                  ]
                : []),
            ],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Insert Left',
                prefix: InsertLeftIcon(),
                select: () => {
                  this.dataManager.insertColumn(
                    columnIndex > 0 ? columnIndex - 1 : undefined
                  );
                },
              }),
              menu.action({
                name: 'Insert Right',
                prefix: InsertRightIcon(),
                select: () => {
                  this.dataManager.insertColumn(columnIndex);
                },
              }),
              menu.action({
                name: 'Move Left',
                prefix: ArrowLeftBigIcon(),
                select: () => {
                  this.dataManager.moveColumn(columnIndex, columnIndex - 2);
                },
              }),
              menu.action({
                name: 'Move Right',
                prefix: ArrowRightBigIcon(),
                select: () => {
                  this.dataManager.moveColumn(columnIndex, columnIndex + 1);
                },
              }),
            ],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Duplicate',
                prefix: DuplicateIcon(),
                select: () => {
                  this.dataManager.duplicateColumn(columnIndex);
                },
              }),

              menu.action({
                name: 'Clear column contents',
                prefix: CloseIcon(),
                select: () => {
                  this.dataManager.clearColumn(column.columnId);
                },
              }),

              menu.action({
                name: 'Delete',
                class: {
                  'delete-item': true,
                },
                prefix: DeleteIcon(),
                select: () => {
                  this.dataManager.deleteColumn(column.columnId);
                },
              }),
            ],
          }),
        ],
      },
    });
  }

  openRowOptions(target: PopupTarget, row: TableRow, rowIndex: number) {
    this.selectionController.setSelected({
      type: 'row',
      rowId: row.rowId,
    });
    popMenu(target, {
      options: {
        onClose: () => {
          this.selectionController.setSelected(undefined);
        },
        items: [
          menu.group({
            items: [
              menu.subMenu({
                name: 'Background color',
                prefix: ColorPickerIcon(),
                options: {
                  items: [
                    { name: 'Default', color: undefined },
                    ...colorList,
                  ].map(item =>
                    menu.action({
                      prefix: html`<div
                        style="color: ${item.color ??
                        cssVarV2.layer.background
                          .primary};display: flex;align-items: center;justify-content: center;"
                      >
                        ${TextBackgroundDuotoneIcon}
                      </div>`,
                      name: item.name,
                      isSelected: row.backgroundColor === item.color,
                      select: () => {
                        this.dataManager.setRowBackgroundColor(
                          row.rowId,
                          item.color
                        );
                      },
                    })
                  ),
                },
              }),
              ...(row.backgroundColor
                ? [
                    menu.action({
                      name: 'Clear row style',
                      prefix: CloseIcon(),
                      select: () => {
                        this.dataManager.setRowBackgroundColor(
                          row.rowId,
                          undefined
                        );
                      },
                    }),
                  ]
                : []),
            ],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Insert Above',
                prefix: InsertAboveIcon(),
                select: () => {
                  this.dataManager.insertRow(
                    rowIndex > 0 ? rowIndex - 1 : undefined
                  );
                },
              }),
              menu.action({
                name: 'Insert Below',
                prefix: InsertBelowIcon(),
                select: () => {
                  this.dataManager.insertRow(rowIndex);
                },
              }),
              menu.action({
                name: 'Move Up',
                prefix: ArrowUpBigIcon(),
                select: () => {
                  this.dataManager.moveRow(rowIndex, rowIndex - 1);
                },
              }),
              menu.action({
                name: 'Move Down',
                prefix: ArrowDownBigIcon(),
                select: () => {
                  this.dataManager.moveRow(rowIndex, rowIndex + 1);
                },
              }),
            ],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Duplicate',
                prefix: DuplicateIcon(),
                select: () => {
                  this.dataManager.duplicateRow(rowIndex);
                },
              }),
              menu.action({
                name: 'Clear row contents',
                prefix: CloseIcon(),
                select: () => {
                  this.dataManager.clearRow(row.rowId);
                },
              }),
              menu.action({
                name: 'Delete',
                class: {
                  'delete-item': true,
                },
                prefix: DeleteIcon(),
                select: () => {
                  this.dataManager.deleteRow(row.rowId);
                },
              }),
            ],
          }),
        ],
      },
    });
  }

  createColorPickerMenu(
    currentColor: string | undefined,
    select: (color?: string) => void
  ) {
    return menu.subMenu({
      name: 'Background color',
      prefix: ColorPickerIcon(),
      options: {
        items: [{ name: 'Default', color: undefined }, ...colorList].map(item =>
          menu.action({
            prefix: html`<div
              style="color: ${item.color ??
              cssVarV2.layer.background
                .primary};display: flex;align-items: center;justify-content: center;"
            >
              ${TextBackgroundDuotoneIcon}
            </div>`,
            name: item.name,
            isSelected: currentColor === item.color,
            select: () => {
              select(item.color);
            },
          })
        ),
      },
    });
  }

  onContextMenu(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    const selected = this.selectionController.selected$.value;
    if (!selected) {
      return;
    }
    if (selected.type === 'area' && e.currentTarget instanceof HTMLElement) {
      const target = popupTargetFromElement(e.currentTarget);
      popMenu(target, {
        options: {
          items: [
            menu.group({
              items: [
                menu.action({
                  name: 'Copy',
                  prefix: CopyIcon(),
                  select: () => {
                    this.selectionController.doCopyOrCut(selected, false);
                  },
                }),
                menu.action({
                  name: 'Paste',
                  prefix: PasteIcon(),
                  select: () => {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    navigator.clipboard.readText().then(text => {
                      this.selectionController.doPaste(text, selected);
                    });
                  },
                }),
              ],
            }),
            menu.group({
              items: [
                menu.action({
                  name: 'Clear contents',
                  prefix: CloseIcon(),
                  select: () => {
                    this.dataManager.clearCellsBySelection(selected);
                  },
                }),
              ],
            }),
          ],
        },
      });
    }
  }

  renderColumnOptions(column: TableColumn, columnIndex: number) {
    const openColumnOptions = (e: Event) => {
      e.stopPropagation();
      const element = e.currentTarget;
      if (element instanceof HTMLElement) {
        this.openColumnOptions(
          popupTargetFromElement(element),
          column,
          columnIndex
        );
      }
    };
    return html`<div class=${columnOptionsCellStyle}>
      <div
        data-testid="drag-column-handle"
        data-drag-column-id=${column.columnId}
        class=${classMap({
          [columnOptionsStyle]: true,
        })}
        style=${styleMap({
          opacity: columnIndex === this.hoverColumnIndex$.value ? 1 : undefined,
        })}
        @click=${openColumnOptions}
      >
        ${threePointerIcon()}
      </div>
    </div>`;
  }

  renderRowOptions(row: TableRow, rowIndex: number) {
    const openRowOptions = (e: Event) => {
      e.stopPropagation();
      const element = e.currentTarget;
      if (element instanceof HTMLElement) {
        this.openRowOptions(popupTargetFromElement(element), row, rowIndex);
      }
    };
    return html`<div class=${rowOptionsCellStyle}>
      <div
        data-testid="drag-row-handle"
        data-drag-row-id=${row.rowId}
        class=${classMap({
          [rowOptionsStyle]: true,
        })}
        style=${styleMap({
          opacity: rowIndex === this.hoverRowIndex$.value ? 1 : undefined,
        })}
        @click=${openRowOptions}
      >
        ${threePointerIcon(true)}
      </div>
    </div>`;
  }
  renderOptionsButton() {
    if (this.readonly || !this.row || !this.column) {
      return nothing;
    }
    return html`
      ${this.rowIndex === 0
        ? this.renderColumnOptions(this.column, this.columnIndex)
        : nothing}
      ${this.columnIndex === 0
        ? this.renderRowOptions(this.row, this.rowIndex)
        : nothing}
    `;
  }

  tdMouseEnter(rowIndex: number, columnIndex: number) {
    this.hoverColumnIndex$.value = columnIndex;
    this.hoverRowIndex$.value = rowIndex;
  }

  tdMouseLeave() {
    this.hoverColumnIndex$.value = undefined;
    this.hoverRowIndex$.value = undefined;
  }

  virtualWidth$ = computed(() => {
    const virtualWidth = this.dataManager.virtualWidth$.value;
    if (!virtualWidth || this.column?.columnId !== virtualWidth.columnId) {
      return undefined;
    }
    return virtualWidth.width;
  });

  tdStyle() {
    const columnWidth = this.virtualWidth$.value ?? this.column?.width;
    const backgroundColor =
      this.column?.backgroundColor ?? this.row?.backgroundColor ?? undefined;
    return styleMap({
      backgroundColor,
      minWidth: columnWidth ? `${columnWidth}px` : `${DefaultColumnWidth}px`,
      maxWidth: columnWidth ? `${columnWidth}px` : `${ColumnMaxWidth}px`,
    });
  }

  showColumnIndicator$ = computed(() => {
    const indicatorIndex =
      this.dataManager.ui.columnIndicatorIndex$.value ?? -1;
    if (indicatorIndex === 0 && this.columnIndex === 0) {
      return 'left';
    }
    if (indicatorIndex - 1 === this.columnIndex) {
      return 'right';
    }
    return;
  });
  showRowIndicator$ = computed(() => {
    const indicatorIndex = this.dataManager.ui.rowIndicatorIndex$.value ?? -1;
    if (indicatorIndex === 0 && this.rowIndex === 0) {
      return 'top';
    }
    if (indicatorIndex - 1 === this.rowIndex) {
      return 'bottom';
    }
    return;
  });
  renderRowIndicator() {
    if (this.readonly) {
      return nothing;
    }
    const columnIndex = this.columnIndex;
    const isFirstColumn = columnIndex === 0;
    const isLastColumn =
      columnIndex === this.dataManager.uiColumns$.value.length - 1;
    const showIndicator = this.showRowIndicator$.value;
    const style = (show: boolean) =>
      styleMap({
        opacity: show ? 1 : 0,
        borderRadius: isFirstColumn
          ? '3px 0 0 3px'
          : isLastColumn
            ? '0 3px 3px 0'
            : '0',
      });
    const indicator0 =
      this.rowIndex === 0
        ? html`
            <div
              style=${style(showIndicator === 'top')}
              class=${rowTopIndicatorStyle}
            ></div>
          `
        : nothing;
    return html`
      ${indicator0}
      <div
        style=${style(showIndicator === 'bottom')}
        class=${rowBottomIndicatorStyle}
      ></div>
    `;
  }
  renderColumnIndicator() {
    if (this.readonly) {
      return nothing;
    }
    const hoverColumnId$ = this.dataManager.hoverDragHandleColumnId$;
    const draggingColumnId$ = this.dataManager.widthAdjustColumnId$;
    const rowIndex = this.rowIndex;
    const isFirstRow = rowIndex === 0;
    const isLastRow = rowIndex === this.dataManager.uiRows$.value.length - 1;
    const showWidthAdjustIndicator =
      draggingColumnId$.value === this.column?.columnId ||
      hoverColumnId$.value === this.column?.columnId;
    const showIndicator = this.showColumnIndicator$.value;
    const style = (show: boolean) =>
      styleMap({
        opacity: show ? 1 : 0,
        borderRadius: isFirstRow
          ? '3px 3px 0 0'
          : isLastRow
            ? '0 0 3px 3px'
            : '0',
      });
    const indicator0 =
      this.columnIndex === 0
        ? html`
            <div
              style=${style(showIndicator === 'left')}
              class=${columnLeftIndicatorStyle}
            ></div>
          `
        : nothing;
    const mouseEnter = () => {
      hoverColumnId$.value = this.column?.columnId;
    };
    const mouseLeave = () => {
      hoverColumnId$.value = undefined;
    };
    return html` ${indicator0}
      <div
        @mouseenter=${mouseEnter}
        @mouseleave=${mouseLeave}
        style=${style(showWidthAdjustIndicator || showIndicator === 'right')}
        data-width-adjust-column-id=${this.column?.columnId}
        class=${columnRightIndicatorStyle}
      ></div>`;
  }

  richText$ = signal<RichText>();

  get inlineEditor() {
    return this.richText$.value?.inlineEditor;
  }

  private readonly _handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') {
      if (e.key === 'Tab') {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    if (this.readonly) {
      return;
    }
    const selectAll = (e: KeyboardEvent) => {
      if (e.key === 'a' && (IS_MAC ? e.metaKey : e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        this.inlineEditor?.selectAll();
      }
    };
    this.disposables.addFromEvent(this, 'keydown', selectAll);
    this.disposables.addFromEvent(this, 'click', (e: MouseEvent) => {
      e.stopPropagation();
      requestAnimationFrame(() => {
        if (!this.inlineEditor?.inlineRange$.value) {
          this.inlineEditor?.focusEnd();
        }
      });
    });
  }

  override firstUpdated() {
    if (this.readonly) {
      return;
    }
    this.richText$.value?.updateComplete
      .then(() => {
        const inlineEditor = this.inlineEditor;
        if (inlineEditor) {
          this.disposables.add(
            inlineEditor.slots.keydown.subscribe(this._handleKeyDown)
          );
        }

        this.disposables.add(
          effect(() => {
            const richText = this.richText$.value;
            if (!richText) {
              return;
            }
            const inlineEditor = this.inlineEditor;
            if (!inlineEditor) {
              return;
            }
            const inlineRange = inlineEditor.inlineRange$.value;
            const targetSelection: TableAreaSelection = {
              type: 'area',
              rowStartIndex: this.rowIndex,
              rowEndIndex: this.rowIndex,
              columnStartIndex: this.columnIndex,
              columnEndIndex: this.columnIndex,
            };
            const currentSelection = this.selectionController.selected$.peek();
            if (
              inlineRange &&
              !TableSelectionData.equals(targetSelection, currentSelection)
            ) {
              this.selectionController.setSelected(targetSelection, false);
            }
          })
        );
      })
      .catch(console.error);
  }

  override render() {
    if (!this.text) {
      return html`<td class=${cellContainerStyle} style=${this.tdStyle()}>
        <div
          style=${styleMap({
            padding: '8px 12px',
          })}
        >
          <div style="height:22px"></div>
        </div>
      </td>`;
    }
    return html`
      <td
        data-row-id=${this.row?.rowId}
        data-column-id=${this.column?.columnId}
        @mouseenter=${() => {
          this.tdMouseEnter(this.rowIndex, this.columnIndex);
        }}
        @mouseleave=${() => {
          this.tdMouseLeave();
        }}
        @contextmenu=${this.onContextMenu}
        class=${cellContainerStyle}
        style=${this.tdStyle()}
      >
        <rich-text
          ${ref(this.richText$)}
          data-disable-ask-ai
          data-not-block-text
          style=${styleMap({
            minHeight: '22px',
            padding: '8px 12px',
          })}
          .yText="${this.text}"
          .inlineEventSource="${this.topContenteditableElement ?? nothing}"
          .attributesSchema="${this.inlineManager?.getSchema()}"
          .attributeRenderer="${this.inlineManager?.getRenderer()}"
          .embedChecker="${this.inlineManager?.embedChecker}"
          .markdownMatches="${this.inlineManager?.markdownMatches}"
          .readonly="${this.readonly}"
          .enableClipboard="${true}"
          .verticalScrollContainerGetter="${() =>
            this.topContenteditableElement?.host
              ? getViewportElement(this.topContenteditableElement.host)
              : null}"
          data-parent-flavour="affine:table"
        ></rich-text>
        ${this.renderOptionsButton()} ${this.renderColumnIndicator()}
        ${this.renderRowIndicator()}
      </td>
    `;
  }
}

export const createColumnDragPreview = (cells: TableCell[]) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.opacity = '0.8';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.zIndex = '1000';
  container.style.boxShadow = '0 0 10px 0 rgba(0, 0, 0, 0.1)';
  container.style.backgroundColor = cssVarV2.layer.background.primary;
  cells.forEach((cell, index) => {
    const div = document.createElement('div');
    const td = cell.querySelector('td');
    if (index !== 0) {
      div.style.borderTop = `1px solid ${cssVarV2.layer.insideBorder.border}`;
    }
    if (td) {
      div.style.height = `${td.getBoundingClientRect().height}px`;
    }
    if (cell.text) {
      const text = new RichText();
      text.style.padding = '8px 12px';
      text.yText = cell.text;
      text.readonly = true;
      text.attributesSchema = cell.inlineManager?.getSchema();
      text.attributeRenderer = cell.inlineManager?.getRenderer();
      text.embedChecker = cell.inlineManager?.embedChecker ?? (() => false);
      div.append(text);
    }
    container.append(div);
  });
  return container;
};

export const createRowDragPreview = (cells: TableCell[]) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.opacity = '0.8';
  container.style.display = 'flex';
  container.style.flexDirection = 'row';
  container.style.zIndex = '1000';
  container.style.boxShadow = '0 0 10px 0 rgba(0, 0, 0, 0.1)';
  container.style.backgroundColor = cssVarV2.layer.background.primary;
  cells.forEach((cell, index) => {
    const div = document.createElement('div');
    const td = cell.querySelector('td');
    if (index !== 0) {
      div.style.borderLeft = `1px solid ${cssVarV2.layer.insideBorder.border}`;
    }
    if (td) {
      div.style.width = `${td.getBoundingClientRect().width}px`;
    }
    if (cell.text) {
      const text = new RichText();
      text.style.padding = '8px 12px';
      text.yText = cell.text;
      text.readonly = true;
      text.attributesSchema = cell.inlineManager?.getSchema();
      text.attributeRenderer = cell.inlineManager?.getRenderer();
      text.embedChecker = cell.inlineManager?.embedChecker ?? (() => false);
      div.append(text);
    }
    container.append(div);
  });
  return container;
};

const threePointerIcon = (vertical: boolean = false) => {
  return html`
    <div
      class=${threePointerIconStyle}
      style=${styleMap({
        transform: vertical ? 'rotate(90deg)' : undefined,
      })}
    >
      <div class=${threePointerIconDotStyle}></div>
      <div class=${threePointerIconDotStyle}></div>
      <div class=${threePointerIconDotStyle}></div>
    </div>
  `;
};
declare global {
  interface HTMLElementTagNameMap {
    [TableCellComponentName]: TableCell;
  }
}
