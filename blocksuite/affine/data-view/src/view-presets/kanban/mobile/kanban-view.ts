import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { AddCursorIcon } from '@blocksuite/icons/lit';
import { css } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { type DataViewInstance, renderUniLit } from '../../../core/index.js';
import { sortable } from '../../../core/utils/wc-dnd/sort/sort-context.js';
import { DataViewBase } from '../../../core/view/data-view-base.js';
import type { KanbanSingleView } from '../kanban-view-manager.js';
import type { KanbanViewSelectionWithType } from '../selection';

const styles = css`
  mobile-data-view-kanban {
    user-select: none;
    display: flex;
    flex-direction: column;
  }

  .mobile-kanban-groups {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 20px;
    padding-bottom: 4px;
    overflow-x: scroll;
    overflow-y: hidden;
  }

  .mobile-add-group {
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    font-size: 16px;
    color: ${unsafeCSSVarV2('icon/primary')};
  }
`;

export class MobileDataViewKanban extends DataViewBase<
  KanbanSingleView,
  KanbanViewSelectionWithType
> {
  static override styles = styles;

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
    return html` <div class="mobile-add-group" @click="${add}">
      ${AddCursorIcon()}
    </div>`;
  };

  get expose(): DataViewInstance {
    return {
      clearSelection: () => {},
      focusFirstCell: () => {},
      getSelection: () => {
        return this.props.selection$.value;
      },
      hideIndicator: () => {},
      moveTo: () => {},
      showIndicator: () => {
        return false;
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
      <div class="mobile-kanban-groups" style="${wrapperStyle}">
        ${repeat(
          groups,
          group => group.key,
          group => {
            return html` <mobile-kanban-group
              ${sortable(group.key)}
              data-key="${group.key}"
              .dataViewEle="${this.props.dataViewEle}"
              .view="${this.props.view}"
              .group="${group}"
            ></mobile-kanban-group>`;
          }
        )}
        ${this.renderAddGroup()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-data-view-kanban': MobileDataViewKanban;
  }
}
