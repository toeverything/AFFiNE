import { popupTargetFromElement } from '@blocksuite/affine-components/context-menu';
import type { ReactiveController } from 'lit';

import { TableViewAreaSelection, TableViewRowSelection } from '../../selection';
import { handleCharStartEdit } from '../../utils.js';
import type { TableViewCellContainer } from '../cell.js';
import { popRowMenu } from '../menu.js';
import type { TableViewUILogic } from '../table-view-ui-logic';

export class TableHotkeysController implements ReactiveController {
  get selectionController() {
    return this.logic.selectionController;
  }

  constructor(private readonly logic: TableViewUILogic) {}

  get host() {
    return this.logic.ui$.value;
  }

  hostConnected() {
    this.host?.disposables.add(
      this.logic.bindHotkey({
        Backspace: () => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return;
          }
          if (TableViewRowSelection.is(selection)) {
            const rows = TableViewRowSelection.rowsIds(selection);
            this.selectionController.selection = undefined;
            this.logic.view.rowsDelete(rows);
            this.logic.ui$.value?.requestUpdate();
            return;
          }
          const {
            focus,
            rowsSelection,
            columnsSelection,
            isEditing,
            groupKey,
          } = selection;
          if (focus && !isEditing) {
            if (rowsSelection && columnsSelection) {
              // multi cell
              for (let i = rowsSelection.start; i <= rowsSelection.end; i++) {
                const { start, end } = columnsSelection;
                for (let j = start; j <= end; j++) {
                  const container = this.selectionController.getCellContainer(
                    groupKey,
                    i,
                    j
                  );
                  const rowId = container?.dataset.rowId;
                  const columnId = container?.dataset.columnId;
                  if (rowId && columnId) {
                    container?.column.valueSetFromString(rowId, '');
                  }
                }
              }
            } else {
              // single cell
              const container = this.selectionController.getCellContainer(
                groupKey,
                focus.rowIndex,
                focus.columnIndex
              );
              const rowId = container?.dataset.rowId;
              const columnId = container?.dataset.columnId;
              if (rowId && columnId) {
                container?.column.valueSetFromString(rowId, '');
              }
            }
          }
        },
        Escape: () => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return false;
          }
          if (TableViewRowSelection.is(selection)) {
            const result = this.selectionController.rowsToArea(
              selection.rows.map(v => v.id)
            );
            if (result) {
              this.selectionController.selection =
                TableViewAreaSelection.create({
                  groupKey: result.groupKey,
                  focus: {
                    rowIndex: result.start,
                    columnIndex: 0,
                  },
                  rowsSelection: {
                    start: result.start,
                    end: result.end,
                  },
                  isEditing: false,
                });
            } else {
              this.selectionController.selection = undefined;
            }
          } else if (selection.isEditing) {
            this.selectionController.selection = {
              ...selection,
              isEditing: false,
            };
          } else {
            const rows = this.selectionController.areaToRows(selection);
            this.selectionController.rowSelectionChange({
              add: rows,
              remove: [],
            });
          }
          return true;
        },
        Enter: context => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return false;
          }
          if (TableViewRowSelection.is(selection)) {
            const result = this.selectionController.rowsToArea(
              selection.rows.map(v => v.id)
            );
            if (result) {
              this.selectionController.selection =
                TableViewAreaSelection.create({
                  groupKey: result.groupKey,
                  focus: {
                    rowIndex: result.start,
                    columnIndex: 0,
                  },
                  rowsSelection: {
                    start: result.start,
                    end: result.end,
                  },
                  isEditing: false,
                });
            }
          } else if (selection.isEditing) {
            this.selectionController.selection = {
              ...selection,
              isEditing: false,
            };
            this.selectionController.focusToCell('down');
          } else {
            this.selectionController.selection = {
              ...selection,
              isEditing: true,
            };
          }
          context.get('keyboardState').raw.preventDefault();
          return true;
        },
        'Shift-Enter': () => {
          const selection = this.selectionController.selection;
          if (
            !selection ||
            TableViewRowSelection.is(selection) ||
            selection.isEditing
          ) {
            return false;
          }
          const cell = this.selectionController.getCellContainer(
            selection.groupKey,
            selection.focus.rowIndex,
            selection.focus.columnIndex
          );
          if (cell) {
            this.selectionController.insertRowAfter(
              selection.groupKey,
              cell.rowId
            );
          }
          return true;
        },
        Tab: ctx => {
          const selection = this.selectionController.selection;
          if (!selection || TableViewRowSelection.is(selection)) {
            return false;
          }
          ctx.get('keyboardState').raw.preventDefault();
          if (selection.isEditing) {
            this.selectionController.selection = {
              ...selection,
              isEditing: false,
            };
          }
          this.selectionController.focusToCell('right');
          return true;
        },
        'Shift-Tab': ctx => {
          const selection = this.selectionController.selection;
          if (!selection || TableViewRowSelection.is(selection)) {
            return false;
          }
          ctx.get('keyboardState').raw.preventDefault();
          if (selection.isEditing) {
            this.selectionController.selection = {
              ...selection,
              isEditing: false,
            };
          }
          this.selectionController.focusToCell('left');
          return true;
        },
        ArrowLeft: context => {
          const selection = this.selectionController.selection;
          if (
            !selection ||
            TableViewRowSelection.is(selection) ||
            selection.isEditing
          ) {
            return false;
          }
          this.selectionController.focusToCell('left');
          context.get('keyboardState').raw.preventDefault();
          return true;
        },
        ArrowRight: context => {
          const selection = this.selectionController.selection;
          if (
            !selection ||
            TableViewRowSelection.is(selection) ||
            selection.isEditing
          ) {
            return false;
          }
          this.selectionController.focusToCell('right');
          context.get('keyboardState').raw.preventDefault();
          return true;
        },
        ArrowUp: context => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return false;
          }

          if (TableViewRowSelection.is(selection)) {
            this.selectionController.navigateRowSelection('up', false);
          } else if (selection.isEditing) {
            return false;
          } else {
            this.selectionController.focusToCell('up');
          }

          context.get('keyboardState').raw.preventDefault();
          return true;
        },
        ArrowDown: context => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return false;
          }

          if (TableViewRowSelection.is(selection)) {
            this.selectionController.navigateRowSelection('down', false);
          } else if (selection.isEditing) {
            return false;
          } else {
            this.selectionController.focusToCell('down');
          }

          context.get('keyboardState').raw.preventDefault();
          return true;
        },

        'Shift-ArrowUp': context => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return false;
          }

          if (TableViewRowSelection.is(selection)) {
            this.selectionController.navigateRowSelection('up', true);
          } else if (selection.isEditing) {
            return false;
          } else {
            this.selectionController.selectionAreaUp();
          }

          context.get('keyboardState').raw.preventDefault();
          return true;
        },

        'Shift-ArrowDown': context => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return false;
          }

          if (TableViewRowSelection.is(selection)) {
            this.selectionController.navigateRowSelection('down', true);
          } else if (selection.isEditing) {
            return false;
          } else {
            this.selectionController.selectionAreaDown();
          }

          context.get('keyboardState').raw.preventDefault();
          return true;
        },

        'Shift-ArrowLeft': context => {
          const selection = this.selectionController.selection;
          if (
            !selection ||
            TableViewRowSelection.is(selection) ||
            selection.isEditing ||
            this.selectionController.isRowSelection()
          ) {
            return false;
          }

          this.selectionController.selectionAreaLeft();

          context.get('keyboardState').raw.preventDefault();
          return true;
        },

        'Shift-ArrowRight': context => {
          const selection = this.selectionController.selection;
          if (
            !selection ||
            TableViewRowSelection.is(selection) ||
            selection.isEditing ||
            this.selectionController.isRowSelection()
          ) {
            return false;
          }

          this.selectionController.selectionAreaRight();

          context.get('keyboardState').raw.preventDefault();
          return true;
        },

        'Mod-a': context => {
          const selection = this.selectionController.selection;
          if (TableViewRowSelection.is(selection)) {
            return false;
          }
          if (selection?.isEditing) {
            return true;
          }
          if (selection) {
            context.get('keyboardState').raw.preventDefault();
            this.selectionController.selection = TableViewRowSelection.create({
              rows:
                this.logic.view.groupTrait.groupsDataList$.value?.flatMap(
                  group =>
                    group?.rows.map(row => ({
                      groupKey: group.key,
                      id: row.rowId,
                    })) ?? []
                ) ??
                this.logic.view.rows$.value.map(row => ({
                  groupKey: undefined,
                  id: row.rowId,
                })),
            });
            return true;
          }
          return;
        },
        '/': context => {
          const selection = this.selectionController.selection;
          if (!selection) {
            return;
          }
          if (TableViewRowSelection.is(selection)) {
            // open multi-rows context-menu
            return;
          }
          if (selection.isEditing) {
            return;
          }
          const cell = this.selectionController.getCellContainer(
            selection.groupKey,
            selection.focus.rowIndex,
            selection.focus.columnIndex
          );
          if (cell) {
            context.get('keyboardState').raw.preventDefault();
            const row = {
              id: cell.rowId,
              groupKey: selection.groupKey,
            };
            this.selectionController.selection = TableViewRowSelection.create({
              rows: [row],
            });
            popRowMenu(
              this.logic,
              popupTargetFromElement(cell),
              this.selectionController
            );
          }
        },
      })
    );
    this.host?.disposables.add(
      this.logic.handleEvent('keyDown', ctx => {
        const event = ctx.get('keyboardState').raw;
        return handleCharStartEdit<TableViewCellContainer>({
          event,
          selection: this.selectionController.selection,
          getCellContainer: this.selectionController.getCellContainer.bind(
            this.selectionController
          ),
          updateSelection: sel => (this.selectionController.selection = sel),
          getColumn: cell => cell.column,
        });
      })
    );
  }
}
