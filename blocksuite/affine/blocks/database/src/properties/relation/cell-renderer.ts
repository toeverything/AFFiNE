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
import { addProperty } from '../../utils/block-utils.js';
import {
  findDatabaseContainingRow,
  getDatabase,
  getDatabases,
} from '../../utils/database-lookup.js';
import {
  relationCellStyle,
  relationChipIconStyle,
  relationEmptyStyle,
  relationPickerHeaderStyle,
  relationPickerRowStyle,
  relationPickerStyle,
  relationSelectStyle,
} from './cell-renderer-css.js';
import {
  type RelationRow,
  renderRelationChip,
  toRelationRow,
} from './chips.js';
import { relationPropertyModelConfig } from './define.js';
import {
  ensureReverseProperty,
  findOrphanIds,
  type RelationPropertyData,
  resolveLinkedRows,
  REVERSE_RELATION_TYPE,
  type ReverseRelationPropertyData,
} from './resolve.js';
import { reverseRelationPropertyModelConfig } from './reverse-define.js';

/** Shared by both directions; only the writable side gets an editor. */
abstract class RelationCellBase<
  Data extends Record<string, unknown>,
> extends BaseCellRenderer<string[], string[], Data> {
  protected get std(): EditorHost['std'] | undefined {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  /** The database this cell's own row lives in. */
  protected readonly ownDatabase$ = computed(() => {
    const store = this.std?.store;
    if (!store) return undefined;
    return findDatabaseContainingRow(store, this.cell.row.rowId);
  });

  protected abstract linkedRows$: ReturnType<typeof computed<RelationRow[]>>;

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(relationCellStyle);
  }

  protected renderChips() {
    const rows = this.linkedRows$.value;
    if (rows.length === 0) return nothing;
    return repeat(
      rows,
      row => row.id,
      row => renderRelationChip(row)
    );
  }
}

export class RelationCell extends RelationCellBase<RelationPropertyData> {
  private readonly targetDatabaseId$ = computed(
    () => this.property.data$.value?.targetDatabaseId || undefined
  );

  /** Every other database on the page -- the choices for "linked database". */
  private readonly candidates$ = computed(() => {
    const store = this.std?.store;
    if (!store) return [];
    const ownId = this.ownDatabase$.value?.id;
    return getDatabases(store)
      .filter(db => db.id !== ownId)
      .map(db => ({ id: db.id, title: db.props.title$.value.toString() }));
  });

  /** Every row of the target database -- what the picker lists. */
  private readonly targetRows$ = computed<RelationRow[]>(() => {
    const store = this.std?.store;
    if (!store) return [];
    const target = getDatabase(store, this.targetDatabaseId$.value);
    if (!target) return [];
    return target.children.map(model => toRelationRow(target, model));
  });

  protected override linkedRows$ = computed<RelationRow[]>(() => {
    const store = this.std?.store;
    const own = this.ownDatabase$.value;
    if (!store || !own) return [];
    const linked = resolveLinkedRows(
      store,
      own,
      this.cell.row.rowId,
      this.cell.propertyId
    );
    if (!linked) return [];
    const byId = new Map(linked.target.children.map(row => [row.id, row]));
    return linked.rowIds
      .map(id => byId.get(id))
      .filter((model): model is BlockModel => model != null)
      .map(model => toRelationRow(linked.target, model));
  });

  private readonly setTargetDatabase = (e: Event) => {
    const targetDatabaseId = (e.target as HTMLSelectElement).value;
    this.property.dataUpdate(() => ({ targetDatabaseId }));
    // Rows of the old target mean nothing under the new one.
    this.valueSetImmediate([]);

    // Give the other database its half straight away. A relation people have
    // to wire twice is one they will wire inconsistently.
    const store = this.std?.store;
    const own = this.ownDatabase$.value;
    if (!store || !own) return;
    const target = getDatabase(store, targetDatabaseId);
    if (!target) return;
    ensureReverseProperty(
      own,
      this.cell.propertyId,
      target,
      (db, name, data) => {
        const dataSource = this.view.manager.dataSource;
        const meta = dataSource.propertyMetaGet(REVERSE_RELATION_TYPE);
        if (!meta) return;
        addProperty(db, 'end', { ...meta.create(name), data });
      }
    );
  };

  private readonly toggle = (rowId: string) => (e: Event) => {
    e.stopPropagation();
    if (this.readonly) return;
    const store = this.std?.store;
    const own = this.ownDatabase$.value;
    const current = this.value$.value ?? [];
    // Writing is the natural moment to drop ids whose row was deleted, so a
    // cell never accumulates references to rows that no longer exist.
    const orphans =
      store && own
        ? new Set(
            findOrphanIds(store, own, this.cell.row.rowId, this.cell.propertyId)
          )
        : new Set<string>();
    const kept = current.filter(id => !orphans.has(id));
    this.valueSetImmediate(
      kept.includes(rowId) ? kept.filter(id => id !== rowId) : [...kept, rowId]
    );
  };

  private renderHeader() {
    const candidates = this.candidates$.value;
    const current = this.targetDatabaseId$.value ?? '';
    return html`<div class="${relationPickerHeaderStyle}">
      <span>Linked database</span>
      <select
        class="${relationSelectStyle}"
        .value="${current}"
        @change="${this.setTargetDatabase}"
        @click="${(e: Event) => e.stopPropagation()}"
      >
        <option value="" ?selected="${!current}">Choose…</option>
        ${repeat(
          candidates,
          db => db.id,
          db => html`<option value="${db.id}" ?selected="${db.id === current}">
            ${db.title || 'Untitled'}
          </option>`
        )}
      </select>
    </div>`;
  }

  private renderPicker() {
    const rows = this.targetRows$.value;
    const selected = new Set(this.value$.value ?? []);
    return html`<div class="${relationPickerStyle}">
      ${this.renderHeader()}
      ${
        rows.length === 0
          ? html`<span class="${relationEmptyStyle}"
              >${
                this.targetDatabaseId$.value
                  ? 'That database has no rows yet'
                  : 'Pick a database above'
              }</span
            >`
          : repeat(
              rows,
              row => row.id,
              row => html`<div
                class="${relationPickerRowStyle}"
                @click="${this.toggle(row.id)}"
              >
                <input type="checkbox" .checked="${selected.has(row.id)}" />
                <span class="${relationChipIconStyle}">${row.icon}</span>
                <span>${row.title || 'Untitled'}</span>
              </div>`
            )
      }
    </div>`;
  }

  override render() {
    return this.isEditing$.value ? this.renderPicker() : this.renderChips();
  }
}

/** Read-only: the rows are whoever points at this one. */
export class ReverseRelationCell extends RelationCellBase<ReverseRelationPropertyData> {
  protected override linkedRows$ = computed<RelationRow[]>(() => {
    const store = this.std?.store;
    const own = this.ownDatabase$.value;
    if (!store || !own) return [];
    const linked = resolveLinkedRows(
      store,
      own,
      this.cell.row.rowId,
      this.cell.propertyId
    );
    if (!linked) return [];
    const byId = new Map(linked.target.children.map(row => [row.id, row]));
    return linked.rowIds
      .map(id => byId.get(id))
      .filter((model): model is BlockModel => model != null)
      .map(model => toRelationRow(linked.target, model));
  });

  override render() {
    return this.renderChips();
  }
}

export const relationColumnConfig =
  relationPropertyModelConfig.createPropertyMeta({
    icon: createIcon('LinkedPageIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(RelationCell),
    },
  });

export const reverseRelationColumnConfig =
  reverseRelationPropertyModelConfig.createPropertyMeta({
    icon: createIcon('LinkedPageIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(ReverseRelationCell),
    },
  });
