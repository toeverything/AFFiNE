import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import type { EditorHost } from '@blocksuite/std';
import { computed } from '@preact/signals-core';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { EditorHostKey } from '../../context/host-context.js';
import {
  relationEmptyStyle,
  relationPickerHeaderStyle,
  relationPickerStyle,
  relationSelectStyle,
} from '../relation/cell-renderer-css.js';
import {
  findDatabaseContainingRow,
  getDatabase,
} from '../../utils/database-lookup.js';
import {
  RELATION_TYPE,
  resolveLinkedRows,
  REVERSE_RELATION_TYPE,
} from '../relation/resolve.js';
import {
  rollupBarFillStyle,
  rollupBarLabelStyle,
  rollupBarTrackStyle,
  rollupBarWrapStyle,
  rollupCellStyle,
  rollupValueStyle,
} from './cell-renderer-css.js';
import { ROLLUP_CALCS, type RollupPropertyData } from './compute.js';
import { rollupPropertyModelConfig } from './define.js';

const CALC_LABELS: Record<(typeof ROLLUP_CALCS)[number], string> = {
  count: 'Count',
  countChecked: 'Count checked',
  percentChecked: 'Percent checked',
  sum: 'Sum',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
};

export class RollupCell extends BaseCellRenderer<
  number | undefined,
  number | undefined,
  RollupPropertyData
> {
  private get std(): EditorHost['std'] | undefined {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  private readonly ownDatabase$ = computed(() => {
    const store = this.std?.store;
    if (!store) return undefined;
    return findDatabaseContainingRow(store, this.cell.row.rowId);
  });

  /** Relation properties on this database -- the possible paths to walk. */
  private readonly relationProperties$ = computed(() => {
    const own = this.ownDatabase$.value;
    if (!own) return [];
    return own.props.columns$.value
      .filter(
        column =>
          column.type === RELATION_TYPE || column.type === REVERSE_RELATION_TYPE
      )
      .map(column => ({ id: column.id, name: column.name }));
  });

  /** Properties of whatever database the chosen relation lands in. */
  private readonly targetProperties$ = computed(() => {
    const store = this.std?.store;
    const own = this.ownDatabase$.value;
    const relationPropertyId = this.property.data$.value?.relationPropertyId;
    if (!store || !own || !relationPropertyId) return [];
    const linked = resolveLinkedRows(
      store,
      own,
      this.cell.row.rowId,
      relationPropertyId
    );
    // With no linked rows yet there is still a target database to read from.
    const target =
      linked?.target ??
      getDatabase(
        store,
        (
          own.props.columns$.value.find(c => c.id === relationPropertyId)
            ?.data as { targetDatabaseId?: string } | undefined
        )?.targetDatabaseId
      );
    if (!target) return [];
    return target.props.columns$.value.map(column => ({
      id: column.id,
      name: column.name,
    }));
  });

  private readonly updateConfig =
    (key: keyof RollupPropertyData) => (e: Event) => {
      const value = (e.target as HTMLSelectElement).value;
      this.property.dataUpdate(data => ({ ...data, [key]: value }));
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
          option => option.id,
          option => html`<option
            value="${option.id}"
            ?selected="${option.id === current}"
          >
            ${option.name || 'Untitled'}
          </option>`
        )}
      </select>
    </div>`;
  }

  private renderConfig() {
    const data = this.property.data$.value;
    return html`<div class="${relationPickerStyle}">
      ${this.renderSelect(
        'Through relation',
        data?.relationPropertyId ?? '',
        this.relationProperties$.value,
        this.updateConfig('relationPropertyId')
      )}
      ${this.renderSelect(
        'Roll up property',
        data?.targetPropertyId ?? '',
        this.targetProperties$.value,
        this.updateConfig('targetPropertyId')
      )}
      ${this.renderSelect(
        'Show as',
        data?.display ?? 'number',
        [
          { id: 'number', name: 'Number' },
          { id: 'bar', name: 'Bar' },
        ],
        this.updateConfig('display')
      )}
      ${this.renderSelect(
        'Calculate',
        data?.calc ?? '',
        ROLLUP_CALCS.map(calc => ({ id: calc, name: CALC_LABELS[calc] })),
        this.updateConfig('calc')
      )}
      ${
        this.relationProperties$.value.length === 0
          ? html`<span class="${relationEmptyStyle}"
              >Add a relation property first</span
            >`
          : ''
      }
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(rollupCellStyle);
  }

  override render() {
    if (this.isEditing$.value) return this.renderConfig();
    const value = this.value$.value;
    const data = this.property.data$.value;
    if (data?.display === 'bar') {
      // Percentages already run 0-100; other aggregates are clamped so the
      // bar stays a bar rather than overflowing its track.
      const pct = Math.max(0, Math.min(100, value ?? 0));
      return html`<div class="${rollupBarWrapStyle}">
        <div class="${rollupBarTrackStyle}">
          <div class="${rollupBarFillStyle}" style="width:${pct}%"></div>
        </div>
        <span class="${rollupBarLabelStyle}"
          >${value == null ? '' : `${Math.round(value)}%`}</span
        >
      </div>`;
    }
    const suffix = data?.calc === 'percentChecked' ? '%' : '';
    return html`<span class="${rollupValueStyle}"
      >${value == null ? '' : `${value}${suffix}`}</span
    >`;
  }
}

export const rollupColumnConfig = rollupPropertyModelConfig.createPropertyMeta({
  icon: createIcon('DatabaseKanbanViewIcon'),
  cellRenderer: {
    view: createFromBaseCellRenderer(RollupCell),
  },
});
