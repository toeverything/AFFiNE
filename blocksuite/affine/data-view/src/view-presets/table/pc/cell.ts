import { TASK_HIERARCHY_LEVEL_COLUMN_NAME } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, signal } from '@preact/signals-core';
import { css } from 'lit';
import { property } from 'lit/decorators.js';

import { renderUniLit } from '../../../core/index.js';
import type {
  CellRenderProps,
  DataViewCellLifeCycle,
} from '../../../core/property/index.js';
import {
  TableViewAreaSelection,
  type TableViewSelectionWithType,
} from '../selection';
import type { TableProperty } from '../table-view-manager.js';
import { calculateHierarchyIndent, normalizeHierarchyLevel } from '../utils';
import type { TableGroup } from './group.js';
import type { TableViewUILogic } from './table-view-ui-logic.js';
export class TableViewCellContainer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    dv-table-view-cell-container {
      display: flex;
      align-items: start;
      width: 100%;
      height: 100%;
      border: none;
      outline: none;
    }

    dv-table-view-cell-container * {
      box-sizing: border-box;
    }

    dv-table-view-cell-container uni-lit > *:first-child {
      padding: 6px;
      padding-inline-start: calc(
        6px + var(--affine-table-hierarchy-indent, 0px)
      );
      border-inline-start: var(--affine-table-hierarchy-cue-width, 0px) solid
        var(--affine-border-color);
    }
  `;

  private readonly _cell$ = signal<DataViewCellLifeCycle>();

  @property({ attribute: false })
  accessor column!: TableProperty;

  @property({ attribute: false })
  accessor rowId!: string;

  private _tagDraft: string | undefined;

  setTagDraft(value: string) {
    this._tagDraft = value;
  }

  consumeTagDraft(): string | undefined {
    const value = this._tagDraft;
    this._tagDraft = undefined;
    return value;
  }

  cell$ = computed(() => {
    return this.column.cellGetOrCreate(this.rowId);
  });

  selectCurrentCell = (editing: boolean) => {
    if (this.view.readonly$.value) {
      return;
    }
    const selectionView = this.selectionController;
    if (selectionView) {
      const selection = selectionView.selection;
      const shouldEnterEditMode =
        editing && this.cell?.beforeEnterEditMode() !== false;
      if (selection && this.isSelected(selection) && shouldEnterEditMode) {
        selectionView.selection = TableViewAreaSelection.create({
          groupKey: this.groupKey,
          focus: {
            rowIndex: this.rowIndex,
            columnIndex: this.columnIndex,
          },
          isEditing: true,
        });
      } else {
        selectionView.selection = TableViewAreaSelection.create({
          groupKey: this.groupKey,
          focus: {
            rowIndex: this.rowIndex,
            columnIndex: this.columnIndex,
          },
          isEditing: false,
        });
      }
    }
  };

  get cell(): DataViewCellLifeCycle | undefined {
    return this._cell$.value;
  }

  private get groupKey() {
    return this.closest<TableGroup>('affine-data-view-table-group')?.group?.key;
  }

  private get selectionController() {
    return this.tableViewLogic.selectionController;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._disposables.addFromEvent(this, 'click', () => {
      if (!this.isEditing$.value) {
        this.selectCurrentCell(!this.column.readonly$.value);
      }
    });
  }

  isSelected(selection: TableViewSelectionWithType) {
    if (selection.selectionType !== 'area') {
      return false;
    }
    if (selection.groupKey !== this.groupKey) {
      return;
    }
    if (selection.focus.columnIndex !== this.columnIndex) {
      return;
    }
    return selection.focus.rowIndex === this.rowIndex;
  }

  override render() {
    const renderer = this.column.renderer$.value;
    if (!renderer) {
      return;
    }
    const { view } = renderer;
    this.view.lockRows(this.isEditing$.value);
    this.dataset['editing'] = `${this.isEditing$.value}`;
    const props: CellRenderProps = {
      cell: this.cell$.value,
      isEditing$: this.isEditing$,
      selectCurrentCell: this.selectCurrentCell,
    };

    const isTitleColumn = this.column.type$.value === 'title';
    if (isTitleColumn) {
      const hierarchyProperty = this.view.propertiesRaw$.value.find(
        property => property.name$.value === TASK_HIERARCHY_LEVEL_COLUMN_NAME
      );
      const hierarchyValue = hierarchyProperty
        ? hierarchyProperty.cellGetOrCreate(this.rowId).jsonValue$.value
        : 0;
      const level = normalizeHierarchyLevel(hierarchyValue);
      this.style.setProperty(
        '--affine-table-hierarchy-indent',
        `${calculateHierarchyIndent(level)}px`
      );
      this.style.setProperty('--affine-table-hierarchy-level', `${level}`);
      this.style.setProperty(
        '--affine-table-hierarchy-cue-width',
        level > 0 ? '1px' : '0px'
      );
    } else {
      this.style.setProperty('--affine-table-hierarchy-indent', '0px');
      this.style.setProperty('--affine-table-hierarchy-cue-width', '0px');
      this.style.setProperty('--affine-table-hierarchy-level', '0');
    }

    return renderUniLit(view, props, {
      ref: this._cell$,
      style: {
        display: 'contents',
      },
    });
  }

  @property({ attribute: false })
  accessor columnId!: string;

  @property({ attribute: false })
  accessor columnIndex!: number;

  isEditing$ = signal(false);

  @property({ attribute: false })
  accessor rowIndex!: number;

  get view() {
    return this.tableViewLogic.view;
  }

  @property({ attribute: false })
  accessor tableViewLogic!: TableViewUILogic;
}

declare global {
  interface HTMLElementTagNameMap {
    'dv-table-view-cell-container': TableViewCellContainer;
  }
}
