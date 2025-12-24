import {
  menu,
  popFilterableSimpleMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed } from '@preact/signals-core';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

import { TableViewAreaSelection } from '../../../selection';
import type { VirtualTableViewUILogic } from '../../table-view-ui-logic';
import type { TableGridGroup } from '../../types';
import * as styles from './group-header-css';
import { GroupTitle } from './group-title';
export class TableGroupHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor tableViewLogic!: VirtualTableViewUILogic;

  @property({ attribute: false })
  accessor gridGroup!: TableGridGroup;

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add(styles.groupHeader);
    this.disposables.addFromEvent(this, 'mouseenter', () => {
      this.gridGroup.data.headerHover$.value = true;
    });
    this.disposables.addFromEvent(this, 'mouseleave', () => {
      this.gridGroup.data.headerHover$.value = false;
    });
  }

  group$ = computed(() => {
    const groups =
      this.tableViewLogic.groupTrait$.value?.groupsDataList$.value ?? [];
    return groups
      .filter((group): group is NonNullable<typeof group> => group != null)
      .find(g => g.key === this.gridGroup.groupId);
  });

  groupKey$ = computed(() => {
    return this.group$.value?.key;
  });

  get tableViewManager() {
    return this.tableViewLogic.view;
  }

  get selectionController() {
    return this.tableViewLogic.selectionController;
  }

  private readonly clickAddRowInStart = () => {
    const group = this.group$.value;
    if (!group) {
      return;
    }
    this.tableViewManager.rowAdd('start', group.key);
    this.requestUpdate();
    const selectionController = this.selectionController;
    selectionController.selection = undefined;
    requestAnimationFrame(() => {
      const index = this.tableViewManager.properties$.value.findIndex(
        v => v.type$.value === 'title'
      );
      selectionController.selection = TableViewAreaSelection.create({
        groupKey: group.key,
        focus: {
          rowIndex: 0,
          columnIndex: index,
        },
        isEditing: true,
      });
    });
  };

  private readonly clickGroupOptions = (e: MouseEvent) => {
    const group = this.group$.value;
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
          this.tableViewManager.rowsDelete(group.rows.map(row => row.rowId));
          this.requestUpdate();
        },
      }),
    ]);
  };

  private readonly renderGroupHeader = () => {
    const group = this.group$.value;
    if (!group) {
      return null;
    }
    return html`
      <div
        style="position: sticky;left: 0;width: max-content;padding: 6px 0;margin-bottom: 4px;display:flex;align-items:center;gap: 12px;max-width: 400px"
      >
        ${GroupTitle(group, {
          groupHover: this.gridGroup.data.headerHover$.value,
          readonly: this.tableViewManager.readonly$.value,
          clickAdd: this.clickAddRowInStart,
          clickOps: this.clickGroupOptions,
        })}
      </div>
    `;
  };

  override render() {
    return html`
      ${this.renderGroupHeader()}
      <virtual-table-header
        .tableViewLogic="${this.tableViewLogic}"
      ></virtual-table-header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-table-group-header': TableGroupHeader;
  }
}
