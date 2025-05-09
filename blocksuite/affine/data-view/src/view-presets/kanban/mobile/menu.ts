import {
  menu,
  popFilterableSimpleMenu,
  type PopupTarget,
} from '@blocksuite/affine-components/context-menu';
import {
  ArrowRightBigIcon,
  DeleteIcon,
  ExpandFullIcon,
  MoveLeftIcon,
  MoveRightIcon,
} from '@blocksuite/icons/lit';
import { html } from 'lit';

import type { DataViewRenderer } from '../../../core/data-view.js';
import { groupTraitKey } from '../../../core/group-by/trait.js';
import type { KanbanSingleView } from '../kanban-view-manager.js';

export const popCardMenu = (
  ele: PopupTarget,
  view: KanbanSingleView,
  groupKey: string,
  cardId: string,
  dataViewEle: DataViewRenderer
) => {
  const groupTrait = view.traitGet(groupTraitKey);
  if (!groupTrait) {
    return;
  }
  popFilterableSimpleMenu(ele, [
    menu.group({
      items: [
        menu.action({
          name: 'Expand Card',
          prefix: ExpandFullIcon(),
          select: () => {
            dataViewEle.openDetailPanel({
              view: view,
              rowId: cardId,
            });
          },
        }),
      ],
    }),
    menu.group({
      items: [
        menu.subMenu({
          name: 'Move To',
          prefix: ArrowRightBigIcon(),
          options: {
            items:
              groupTrait.groupsDataList$.value
                ?.filter(v => {
                  return v.key !== groupKey;
                })
                .map(group => {
                  return menu.action({
                    name: group.value != null ? group.name : 'Ungroup',
                    select: () => {
                      groupTrait.moveCardTo(
                        cardId,
                        groupKey,
                        group.key,
                        'start'
                      );
                    },
                  });
                }) ?? [],
          },
        }),
      ],
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
            view.addCard({ before: true, id: cardId }, groupKey);
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
            view.addCard({ before: false, id: cardId }, groupKey);
          },
        }),
      ],
    }),
    menu.group({
      items: [
        menu.action({
          name: 'Delete Card',
          class: {
            'delete-item': true,
          },
          prefix: DeleteIcon(),
          select: () => {
            view.rowsDelete([cardId]);
          },
        }),
      ],
    }),
  ]);
};
