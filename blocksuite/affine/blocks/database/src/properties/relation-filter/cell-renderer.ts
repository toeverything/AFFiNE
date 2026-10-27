import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import type { EditorHost } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import { computed } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { EditorHostKey } from '../../context/host-context.js';
import {
  findDatabaseContainingRow,
  getDatabase,
} from '../../utils/database-lookup.js';
import {
  relationEmptyStyle,
  relationPickerHeaderStyle,
  relationPickerStyle,
  relationSelectStyle,
} from '../relation/cell-renderer-css.js';
import {
  type RelationRow,
  renderRelationChip,
  toRelationRow,
} from '../relation/chips.js';
import {
  RELATION_TYPE,
  resolveLinkedRows,
  REVERSE_RELATION_TYPE,
} from '../relation/resolve.js';
import {
  RELATION_CONDITIONS,
  type RelationFilterPropertyData,
  relationFilterPropertyModelConfig,
} from './define.js';

const CONDITION_LABELS: Record<(typeof RELATION_CONDITIONS)[number], string> = {
  checked: 'is checked',
  unchecked: 'is not checked',
  notEmpty: 'is not empty',
  empty: 'is empty',
  gte: 'is at least',
  lt: 'is below',
};

export class RelationFilterCell extends BaseCellRenderer<
  string[],
  string[],
  RelationFilterPropertyData
> {
  private get std(): EditorHost['std'] | undefined {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  private readonly ownDatabase$ = computed(() => {
    const store = this.std?.store;
    if (!store) return undefined;
    return findDatabaseContainingRow(store, this.cell.row.rowId);
  });

  private readonly relationProperties$ = computed(() => {
    const own = this.ownDatabase$.value;
    if (!own) return [];
    return own.props.columns$.value
      .filter(c => c.type === RELATION_TYPE || c.type === REVERSE_RELATION_TYPE)
      .map(c => ({ id: c.id, name: c.name }));
  });

  /** The database a relation property on this one lands in, rows or not. */
  private targetDatabaseOf(relationPropertyId: string | undefined) {
    const store = this.std?.store;
    const own = this.ownDatabase$.value;
    if (!store || !own || !relationPropertyId) return undefined;
    const linked = resolveLinkedRows(
      store,
      own,
      this.cell.row.rowId,
      relationPropertyId
    );
    if (linked) return linked.target;
    const column = own.props.columns$.value.find(
      c => c.id === relationPropertyId
    );
    return getDatabase(
      store,
      (column?.data as { targetDatabaseId?: string } | undefined)
        ?.targetDatabaseId
    );
  }

  private readonly target$ = computed(() =>
    this.targetDatabaseOf(this.property.data$.value?.relationPropertyId)
  );

  private readonly targetProperties$ = computed(() =>
    (this.target$.value?.props.columns$.value ?? []).map(c => ({
      id: c.id,
      name: c.name,
    }))
  );

  private readonly rows$ = computed<RelationRow[]>(() => {
    const target = this.target$.value;
    const ids = this.value$.value ?? [];
    if (!target || ids.length === 0) return [];
    const byId = new Map(target.children.map(row => [row.id, row]));
    return ids
      .map(id => byId.get(id))
      .filter((model): model is BlockModel => model != null)
      .map(model => toRelationRow(target, model));
  });

  private readonly updateConfig =
    (key: keyof RelationFilterPropertyData) => (e: Event) => {
      const raw = (e.target as HTMLInputElement | HTMLSelectElement).value;
      const value = key === 'threshold' ? Number(raw) || 0 : raw;
      this.property.dataUpdate(data => ({
        ...data,
        [key]: value,
        // The tested property belongs to the old relation's database. Left in
        // place it reads as empty on every row, so `empty` and `unchecked`
        // would pass rows that were never tested.
        ...(key === 'relationPropertyId' &&
        !this.targetDatabaseOf(String(value))?.props.columns$.value.some(
          column => column.id === data.targetPropertyId
        )
          ? { targetPropertyId: '' }
          : {}),
      }));
    };

  private renderSelect(
    label: string,
    current: string,
    options: { id: string; name: string }[],
    onChange: (e: Event) => void
  ) {
    return html`<div class="${relationPickerHeaderStyle}">
      <span>${label}</span>
      <select
        class="${relationSelectStyle}"
        @change="${onChange}"
        @click="${(e: Event) => e.stopPropagation()}"
      >
        <option value="" ?selected="${!current}">Choose…</option>
        ${repeat(
          options,
          o => o.id,
          o => html`<option value="${o.id}" ?selected="${o.id === current}">
            ${o.name || 'Untitled'}
          </option>`
        )}
      </select>
    </div>`;
  }

  private renderConfig() {
    const data = this.property.data$.value;
    const numeric = data?.condition === 'gte' || data?.condition === 'lt';
    return html`<div class="${relationPickerStyle}">
      ${this.renderSelect(
        'Through relation',
        data?.relationPropertyId ?? '',
        this.relationProperties$.value,
        this.updateConfig('relationPropertyId')
      )}
      ${this.renderSelect(
        'Where property',
        data?.targetPropertyId ?? '',
        this.targetProperties$.value,
        this.updateConfig('targetPropertyId')
      )}
      ${this.renderSelect(
        'Condition',
        data?.condition ?? '',
        RELATION_CONDITIONS.map(c => ({ id: c, name: CONDITION_LABELS[c] })),
        this.updateConfig('condition')
      )}
      ${
        numeric
          ? html`<div class="${relationPickerHeaderStyle}">
              <span>Value</span>
              <input
                class="${relationSelectStyle}"
                type="number"
                .value="${String(data?.threshold ?? 100)}"
                @change="${this.updateConfig('threshold')}"
                @click="${(e: Event) => e.stopPropagation()}"
              />
            </div>`
          : ''
      }
      ${
        this.relationProperties$.value.length === 0
          ? html`<span class="${relationEmptyStyle}"
              >Add a relation property first</span
            >`
          : ''
      }
    </div>`;
  }

  override render() {
    if (this.isEditing$.value) return this.renderConfig();
    const rows = this.rows$.value;
    if (rows.length === 0) return nothing;
    return repeat(
      rows,
      row => row.id,
      row => renderRelationChip(row)
    );
  }
}

export const relationFilterColumnConfig =
  relationFilterPropertyModelConfig.createPropertyMeta({
    icon: createIcon('FilterIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(RelationFilterCell),
    },
  });
