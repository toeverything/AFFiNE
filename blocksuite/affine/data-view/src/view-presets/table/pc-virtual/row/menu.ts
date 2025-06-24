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
