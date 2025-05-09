import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { AddCursorIcon } from '@blocksuite/icons/lit';
import { computed } from '@preact/signals-core';
import { css } from 'lit';
import { query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { type DataViewInstance, renderUniLit } from '../../../core/index.js';
import { defaultActivators } from '../../../core/utils/wc-dnd/sensors/index.js';
import {
  createSortContext,
  sortable,
} from '../../../core/utils/wc-dnd/sort/sort-context.js';
import { horizontalListSortingStrategy } from '../../../core/utils/wc-dnd/sort/strategies/index.js';
import { DataViewBase } from '../../../core/view/data-view-base.js';
import type { KanbanSingleView } from '../kanban-view-manager.js';
import type { KanbanViewSelectionWithType } from '../selection';
import { KanbanClipboardController } from './controller/clipboard.js';
import { KanbanDragController } from './controller/drag.js';
import { KanbanHotkeysController } from './controller/hotkeys.js';
import { KanbanSelectionController } from './controller/selection.js';

const styles = css`
  affine-data-view-kanban {
    user-select: none;
    display: flex;
    flex-direction: column;
  }

  .affine-data-view-kanban-groups {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 20px;
    padding-bottom: 4px;
    overflow-x: scroll;
    overflow-y: hidden;
  }

  .affine-data-view-kanban-groups:hover {
    padding-bottom: 0px;
  }

  .affine-data-view-kanban-groups::-webkit-scrollbar {
    -webkit-appearance: none;
    display: block;
  }

  .affine-data-view-kanban-groups::-webkit-scrollbar:horizontal {
    height: 4px;
  }

  .affine-data-view-kanban-groups::-webkit-scrollbar-thumb {
    border-radius: 2px;
    background-color: transparent;
  }

  .affine-data-view-kanban-groups:hover::-webkit-scrollbar:horizontal {
    height: 8px;
  }

  .affine-data-view-kanban-groups:hover::-webkit-scrollbar-thumb {
    border-radius: 16px;
    background-color: var(--affine-black-30);
  }

  .affine-data-view-kanban-groups:hover::-webkit-scrollbar-track {
    background-color: var(--affine-hover-color);
  }

  .add-group-icon {
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .add-group-icon:hover {
    background-color: var(--affine-hover-color);
  }

  .add-group-icon svg {
    width: 16px;
    height: 16px;
    fill: var(--affine-icon-color);
    color: var(--affine-icon-color);
  }
`;

export class DataViewKanban extends DataViewBase<
  KanbanSingleView,
  KanbanViewSelectionWithType
> {
  static override styles = styles;

  private readonly dragController = new KanbanDragController(this);

  clipboardController = new KanbanClipboardController(this);

  hotkeysController = new KanbanHotkeysController(this);

  onWheel = (event: WheelEvent) => {
    if (event.metaKey || event.ctrlKey) {
      return;
    }
    const ele = event.currentTarget;
    if (ele instanceof HTMLElement) {
      if (ele.scrollWidth === ele.clientWidth) {
        return;
      }
      event.stopPropagation();
    }
  };

  renderAddGroup = () => {
    const addGroup = this.groupManager.addGroup;
    if (!addGroup) {
      return;
    }
    const add = (e: MouseEvent) => {
      const ele = e.currentTarget as HTMLElement;
      popMenu(popupTargetFromElement(ele), {
        options: {
          items: [
            menu.input({
              onComplete: text => {
                const column = this.groupManager.property$.value;
                if (column) {
                  column.dataUpdate(
                    () =>
                      addGroup({
                        text,
                        oldData: column.data$.value,
                        dataSource: this.props.view.manager.dataSource,
                      }) as never
                  );
                }
              },
            }),
          ],
        },
      });
    };
    return html` <div
      style="height: 32px;flex-shrink:0;display:flex;align-items:center;"
      @click="${add}"
    >
      <div class="add-group-icon">${AddCursorIcon()}</div>
    </div>`;
  };

  selectionController = new KanbanSelectionController(this);

  sortContext = createSortContext({
    activators: defaultActivators,
    container: this,
    onDragEnd: evt => {
      const over = evt.over;
      const activeId = evt.active.id;
      const groups = this.groupManager.groupsDataList$.value;
      if (over && over.id !== activeId && groups) {
        const activeIndex = groups.findIndex(data => data?.key === activeId);
        const overIndex = groups.findIndex(data => data?.key === over.id);

        this.groupManager.moveGroupTo(
          activeId,
          activeIndex > overIndex
            ? {
                before: true,
                id: over.id,
              }
            : {
                before: false,
                id: over.id,
              }
        );
      }
    },
    modifiers: [
      ({ transform }) => {
        return {
          ...transform,
          y: 0,
        };
      },
    ],
    items: computed(() => {
      return (
        this.groupManager.groupsDataList$.value?.map(
          v => v?.key ?? 'default key'
        ) ?? []
      );
    }),
    strategy: horizontalListSortingStrategy,
  });

  get expose(): DataViewInstance {
    return {
      clearSelection: () => {
        this.selectionController.clear();
      },
      addRow: position => {
        if (this.props.view.readonly$.value) return;
        const rowId = this.props.view.rowAdd(position);
        if (rowId) {
          this.props.dataViewEle.openDetailPanel({
            view: this.props.view,
            rowId,
          });
        }
        return rowId;
      },
      focusFirstCell: () => {
        this.selectionController.focusFirstCell();
      },
      getSelection: () => {
        return this.selectionController.selection;
      },
      hideIndicator: () => {
        this.dragController.dropPreview.remove();
      },
      moveTo: (id, evt) => {
        const position = this.dragController.getInsertPosition(evt);
        if (position) {
          position.group.group.manager.moveCardTo(
            id,
            '',
            position.group.group.key,
            position.position
          );
        }
      },
      showIndicator: evt => {
        return this.dragController.shooIndicator(evt, undefined) != null;
      },
      view: this.props.view,
      eventTrace: this.props.eventTrace,
    };
  }

  get groupManager() {
    return this.props.view.groupTrait;
  }

  override render() {
    const groups = this.groupManager.groupsDataList$.value;
    if (!groups) {
      return html``;
    }
    const vPadding = this.props.virtualPadding$.value;
    const wrapperStyle = styleMap({
      marginLeft: `-${vPadding}px`,
      marginRight: `-${vPadding}px`,
      paddingLeft: `${vPadding}px`,
      paddingRight: `${vPadding}px`,
    });
    return html`
      ${renderUniLit(this.props.headerWidget, {
        dataViewInstance: this.expose,
      })}
      <div
        class="affine-data-view-kanban-groups"
        style="${wrapperStyle}"
        @wheel="${this.onWheel}"
      >
        ${repeat(
          groups,
          group => group?.key ?? 'default key',
          group => {
            if (!group) return;
            return html` <affine-data-view-kanban-group
              ${sortable(group.key)}
              data-key="${group.key}"
              .dataViewEle="${this.props.dataViewEle}"
              .view="${this.props.view}"
              .group="${group}"
            ></affine-data-view-kanban-group>`;
          }
        )}
        ${this.renderAddGroup()}
      </div>
    `;
  }

  @query('.affine-data-view-kanban-groups')
  accessor groups!: HTMLElement;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-kanban': DataViewKanban;
  }
}
