import {
  menu,
  popFilterableSimpleMenu,
  type PopupTarget,
} from '@blocksuite/affine-components/context-menu';
import { DeleteIcon, ExpandFullIcon } from '@blocksuite/icons/lit';

import type { DataViewRenderer } from '../../../core/data-view.js';
import type { SingleView } from '../../../core/index.js';

export const popMobileRowMenu = (
  target: PopupTarget,
  rowId: string,
  dataViewEle: DataViewRenderer,
  view: SingleView
) => {
  popFilterableSimpleMenu(target, [
    menu.group({
      items: [
        menu.action({
          name: 'Expand Row',
          prefix: ExpandFullIcon(),
          select: () => {
            dataViewEle.openDetailPanel({
              view: view,
              rowId: rowId,
            });
          },
        }),
      ],
    }),
    menu.group({
      name: '',
      items: [
        menu.action({
          name: 'Delete Row',
          class: { 'delete-item': true },
          prefix: DeleteIcon(),
          select: () => {
            view.rowsDelete([rowId]);
          },
        }),
      ],
    }),
  ]);
};
