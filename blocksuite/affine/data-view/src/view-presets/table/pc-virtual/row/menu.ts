import {
  menu,
  popFilterableSimpleMenu,
  type PopupTarget,
} from '@blocksuite/affine-components/context-menu';
import {
  CopyIcon,
  DeleteIcon,
  ExpandFullIcon,
  MoveLeftIcon,
  MoveRightIcon,
} from '@blocksuite/icons/lit';
import { html } from 'lit';

import { TableViewRowSelection } from '../../selection';
import type { TableSelectionController } from '../controller/selection';
import type { VirtualTableViewUILogic } from '../table-view-ui-logic';

export const openDetail = (
  tableViewLogic: VirtualTableViewUILogic,
  rowId: string,
  selection: TableSelectionController
) => {
  const old = selection.selection;
  selection.selection = undefined;
  tableViewLogic.root.openDetailPanel({
    view: tableViewLogic.view,
    rowId: rowId,
    onClose: () => {
      selection.selection = old;
    },
  });
};

export const popRowMenu = (
  tableViewLogic: VirtualTableViewUILogic,
  ele: PopupTarget,
  selectionController: TableSelectionController
) => {
  const dataSource = tableViewLogic.view.manager.dataSource as {
    getTaskStatusInheritance?: () => {
      done: 'require-all-subtasks-complete' | 'disabled';
      inProgress: 'start-when-any-subtask-starts' | 'disabled';
      autoDemoteAutoDone: boolean;
      cascadeManualDoneToDescendants: boolean;
    };
    setTaskStatusInheritance?: (next: {
      done?: 'require-all-subtasks-complete' | 'disabled';
      inProgress?: 'start-when-any-subtask-starts' | 'disabled';
      autoDemoteAutoDone?: boolean;
      cascadeManualDoneToDescendants?: boolean;
    }) => void;
  };
  const inheritance = dataSource.getTaskStatusInheritance?.();
  const parentStatusBehaviorMenu = menu.subMenu({
    name: 'Parent status behavior',
    options: {
      items: [
        menu.action({
          name: 'Require all subtasks complete',
          isSelected: inheritance?.done === 'require-all-subtasks-complete',
          select: () => {
            dataSource.setTaskStatusInheritance?.({
              done: 'require-all-subtasks-complete',
            });
          },
        }),
        menu.action({
          name: 'Disable parent done inheritance',
          isSelected: inheritance?.done === 'disabled',
          select: () => {
            dataSource.setTaskStatusInheritance?.({ done: 'disabled' });
          },
        }),
        menu.action({
          name: 'Start progress when any subtask starts',
          isSelected:
            inheritance?.inProgress === 'start-when-any-subtask-starts',
          select: () => {
            dataSource.setTaskStatusInheritance?.({
              inProgress: 'start-when-any-subtask-starts',
            });
          },
        }),
        menu.action({
          name: 'Disable parent progress inheritance',
          isSelected: inheritance?.inProgress === 'disabled',
          select: () => {
            dataSource.setTaskStatusInheritance?.({
              inProgress: 'disabled',
            });
          },
        }),
        menu.action({
          name: 'Auto-demote auto-derived Done',
          isSelected: inheritance?.autoDemoteAutoDone ?? true,
          select: () => {
            dataSource.setTaskStatusInheritance?.({
              autoDemoteAutoDone: true,
            });
          },
        }),
        menu.action({
          name: 'Keep auto-derived Done locked',
          isSelected: inheritance?.autoDemoteAutoDone === false,
          select: () => {
            dataSource.setTaskStatusInheritance?.({
              autoDemoteAutoDone: false,
            });
          },
        }),
        menu.action({
          name: 'Manual Done cascades to descendants',
          isSelected: inheritance?.cascadeManualDoneToDescendants ?? true,
          select: () => {
            dataSource.setTaskStatusInheritance?.({
              cascadeManualDoneToDescendants: true,
            });
          },
        }),
        menu.action({
          name: 'Manual Done does not cascade',
          isSelected: inheritance?.cascadeManualDoneToDescendants === false,
          select: () => {
            dataSource.setTaskStatusInheritance?.({
              cascadeManualDoneToDescendants: false,
            });
          },
        }),
      ],
    },
  });
  const selection = selectionController.selection;
  if (!TableViewRowSelection.is(selection)) {
    return;
  }
  if (selection.rows.length > 1) {
    const rows = TableViewRowSelection.rowsIds(selection);
    popFilterableSimpleMenu(ele, [
      menu.group({
        name: '',
        items: [
          parentStatusBehaviorMenu,
          menu.action({
            name: 'Copy',
            prefix: html` <div
              style="transform: rotate(90deg);display:flex;align-items:center;"
            >
              ${CopyIcon()}
            </div>`,
            select: () => {
              tableViewLogic.clipboardController.copy();
            },
          }),
        ],
      }),
      menu.group({
        name: '',
        items: [
          menu.action({
            name: 'Delete Rows',
            class: {
              'delete-item': true,
            },
            prefix: DeleteIcon(),
            select: () => {
              selectionController.view.rowsDelete(rows);
              selectionController.logic.ui$.value?.requestUpdate();
            },
          }),
        ],
      }),
    ]);
    return;
  }
  const row = selection.rows[0];
  if (!row) return;
  popFilterableSimpleMenu(ele, [
    menu.action({
      name: 'Expand Row',
      prefix: ExpandFullIcon(),
      select: () => {
        openDetail(tableViewLogic, row.id, selectionController);
      },
    }),
    menu.group({
      name: '',
      items: [
        parentStatusBehaviorMenu,
        menu.action({
          name: 'Indent Row',
          select: () => {
            selectionController.indentHierarchyRow();
          },
        }),
        menu.action({
          name: 'Unindent Row',
          select: () => {
            selectionController.unindentHierarchyRow();
          },
        }),
        menu.action({
          name: 'Insert Before',
          prefix: html` <div
            style="transform: rotate(90deg);display:flex;align-items:center;"
          >
            ${MoveLeftIcon()}
          </div>`,
          select: () => {
            selectionController.insertRowBefore(row.groupKey, row.id);
          },
        }),
        menu.action({
          name: 'Insert After',
          prefix: html` <div
            style="transform: rotate(90deg);display:flex;align-items:center;"
          >
            ${MoveRightIcon()}
          </div>`,
          select: () => {
            selectionController.insertRowAfter(row.groupKey, row.id);
          },
        }),
      ],
    }),
    menu.group({
      items: [
        menu.action({
          name: 'Delete Row',
          class: { 'delete-item': true },
          prefix: DeleteIcon(),
          select: () => {
            selectionController.deleteRow(row.id);
          },
        }),
      ],
    }),
  ]);
};
