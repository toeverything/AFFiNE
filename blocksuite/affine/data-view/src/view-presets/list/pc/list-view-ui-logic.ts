import {
  menu,
  type MenuConfig,
} from '@blocksuite/affine-components/context-menu';
import {
  type InsertToPosition,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import { ArrowRightSmallIcon, ViewIcon } from '@blocksuite/icons/lit';
import { signal } from '@preact/signals-core';
import { html } from 'lit';

import { createUniComponentFromWebComponent } from '../../../core/utils/uni-component/uni-component.js';
import { DataViewUILogicBase } from '../../../core/view/data-view-base.js';
import {
  applyHierarchyMutation,
  computeIndentMutation,
  computeUnindentMutation,
  normalizeHierarchyLevel,
} from '../../table/utils.js';
import type { ListSingleView } from '../list-view-manager.js';
import { ListDragController } from './controller/drag.js';
import { ListViewRenderer } from './renderer.js';

type TodoListRowDataSource = {
  rowAddAsTodoList?: (position: InsertToPosition | number) => string;
  ensureRowAsTodoList?: (rowId: string) => boolean;
};

const addTodoListRow = (
  view: ListSingleView,
  position: InsertToPosition | number
) => {
  const dataSource = view.manager?.dataSource as
    | TodoListRowDataSource
    | undefined;
  return dataSource?.rowAddAsTodoList?.(position) ?? view.rowAdd(position);
};

export class ListViewUILogic extends DataViewUILogicBase<ListSingleView> {
  // Story 2.8: mirrors `TableViewUILogic.ui$` — the rendered
  // `ListViewRenderer` instance, set from its own `connectedCallback`, so
  // `ListDragController` (which needs real DOM to query rows/handles from)
  // has something to anchor to.
  ui$ = signal<ListViewRenderer>();

  dragController = new ListDragController(this);

  clearSelection = () => {
    this.setSelection();
  };

  ensureTodoListRow(rowId: string) {
    const dataSource = this.view.manager?.dataSource as
      | TodoListRowDataSource
      | undefined;
    return dataSource?.ensureRowAsTodoList?.(rowId) ?? false;
  }

  ensureTodoListRows(rowIds: string[]) {
    const dataSource = this.view.manager?.dataSource as
      | TodoListRowDataSource
      | undefined;
    // `.some()` short-circuits on the first row that returns `true` — and
    // `ensureRowAsTodoList` returns `true` both for a row it just converted
    // *and* for a row that's already todo-type (a no-op check) — so with
    // even one pre-existing todo row in the list, every other row (any
    // plain paragraph still needing conversion) was silently skipped every
    // single call. Must process every row, not stop at the first truthy
    // one.
    let changed = false;
    for (const rowId of rowIds) {
      if (dataSource?.ensureRowAsTodoList?.(rowId)) {
        changed = true;
      }
    }
    return changed;
  }

  addRow = (position: InsertToPosition) => {
    return addTodoListRow(this.view, position);
  };

  addRowAfter(rowId: string) {
    const levelProperty = this.view.propertiesRaw$.value.find(
      property => property.name$.value === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    const rowIds = this.view.rowIds$.value;
    const rowIndex = rowIds.indexOf(rowId);
    const rowLevel = levelProperty
      ? normalizeHierarchyLevel(
          levelProperty.cellGetOrCreate(rowId).jsonValue$.value
        )
      : 0;
    let insertIndex = rowIndex + 1;
    if (levelProperty && rowIndex >= 0) {
      while (insertIndex < rowIds.length) {
        const nextRowId = rowIds[insertIndex];
        if (!nextRowId) {
          break;
        }
        const nextLevel = normalizeHierarchyLevel(
          levelProperty.cellGetOrCreate(nextRowId).jsonValue$.value
        );
        if (nextLevel <= rowLevel) {
          break;
        }
        insertIndex += 1;
      }
    }
    const insertPosition: InsertToPosition | number =
      insertIndex >= rowIds.length
        ? 'end'
        : { before: true, id: rowIds[insertIndex] as string };
    const newRowId = addTodoListRow(this.view, insertPosition);
    const getColumnStringValue = (columnName: string) => {
      const property = this.view.propertiesRaw$.value.find(
        property => property.name$.value === columnName
      );
      return property?.stringValueGet(rowId) ?? '';
    };
    const parent = getColumnStringValue(TASK_PARENT_IDENTIFIER_COLUMN_NAME);
    const ancestors = getColumnStringValue(
      TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
    );
    const dataSource = this.view.manager?.dataSource as
      | {
          applyTaskHierarchyMutation?: (
            updatedLevels: Map<string, number>,
            updatedParents: Map<string, string | undefined>,
            updatedAncestors: Map<string, string>
          ) => void;
        }
      | undefined;
    if (dataSource?.applyTaskHierarchyMutation) {
      dataSource.applyTaskHierarchyMutation(
        new Map([[newRowId, rowLevel]]),
        new Map([[newRowId, parent || undefined]]),
        new Map([[newRowId, ancestors]])
      );
      return newRowId;
    }
    const copyColumnValue = (columnName: string) => {
      const property = this.view.propertiesRaw$.value.find(
        property => property.name$.value === columnName
      );
      if (!property) {
        return;
      }
      property.valueSetFromString(
        newRowId,
        property.stringValueGet(rowId) ?? ''
      );
    };
    copyColumnValue(TASK_HIERARCHY_LEVEL_COLUMN_NAME);
    copyColumnValue(TASK_PARENT_IDENTIFIER_COLUMN_NAME);
    copyColumnValue(TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME);
    return newRowId;
  }

  private applyHierarchyResult(
    result: ReturnType<typeof computeIndentMutation>,
    rowId: string
  ) {
    if (!result) {
      return false;
    }
    const dataSource = this.view.manager.dataSource as {
      doc?: { id: string };
      applyTaskHierarchyMutation?: (
        updatedLevels: Map<string, number>,
        updatedParents: Map<string, string | undefined>,
        updatedAncestors: Map<string, string>
      ) => void;
    };
    if (dataSource.applyTaskHierarchyMutation) {
      dataSource.applyTaskHierarchyMutation(
        result.updatedLevels,
        result.updatedParents,
        result.updatedAncestors
      );
    } else {
      applyHierarchyMutation(
        {
          rowIds: this.view.rowIds$.value,
          rowId,
          docId: dataSource.doc?.id ?? '',
          properties: this.view.propertiesRaw$.value,
        },
        result
      );
    }
    return true;
  }

  indentRow(rowId: string) {
    const dataSource = this.view.manager.dataSource as { doc?: { id: string } };
    return this.applyHierarchyResult(
      computeIndentMutation({
        rowIds: this.view.rowIds$.value,
        rowId,
        docId: dataSource.doc?.id ?? '',
        properties: this.view.propertiesRaw$.value,
      }),
      rowId
    );
  }

  unindentRow(rowId: string) {
    const dataSource = this.view.manager.dataSource as { doc?: { id: string } };
    return this.applyHierarchyResult(
      computeUnindentMutation({
        rowIds: this.view.rowIds$.value,
        rowId,
        docId: dataSource.doc?.id ?? '',
        properties: this.view.propertiesRaw$.value,
      }),
      rowId
    );
  }

  getViewOptionsSettingItems(
    navigateToSubPage: (title: string, getItems: () => MenuConfig[]) => void,
    goBack: () => void
  ): MenuConfig[] {
    const layoutOptions: [string, string][] = [
      ['inline', 'Inline'],
      ['aligned', 'Aligned'],
      ['right', 'Right'],
    ];
    const getLayoutItems = (): MenuConfig[] =>
      layoutOptions.map(([layout, label]) =>
        menu.action({
          name: label,
          closeOnSelect: false,
          postfix:
            this.view.fieldLayout$.value === layout
              ? html`<span>✓</span>`
              : undefined,
          select: () => {
            this.view.setFieldLayout(layout as 'inline' | 'aligned' | 'right');
            goBack();
          },
        })
      );

    return [
      menu.group({
        name: 'List fields',
        items: [
          menu.action({
            name: this.view.showAdditionalFields$.value
              ? 'Hide additional fields'
              : 'Show additional fields',
            prefix: ViewIcon(),
            closeOnSelect: false,
            select: () => {
              this.view.setAdditionalFieldsVisible(
                !this.view.showAdditionalFields$.value
              );
            },
          }),
          menu.action({
            name: 'Field layout',
            prefix: ViewIcon(),
            closeOnSelect: false,
            postfix: html`<div
                style="font-size:14px;color:var(--affine-text-secondary-color);"
              >
                ${this.view.fieldLayout$.value}
              </div>
              ${ArrowRightSmallIcon()}`,
            select: () => {
              navigateToSubPage('Field layout', getLayoutItems);
              return false;
            },
          }),
        ],
      }),
    ];
  }

  focusFirstCell = () => {};

  showIndicator = () => false;

  hideIndicator = () => {};

  moveTo = () => {};

  renderer = createUniComponentFromWebComponent(ListViewRenderer);
}
