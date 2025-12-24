import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { CheckBoxCheckSolidIcon, CheckBoxUnIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, effect } from '@preact/signals-core';
import clsx from 'clsx';
import { nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit/static-html.js';

import type { VirtualTableViewUILogic } from '../table-view-ui-logic.js';
import type { TableGridCell } from '../types.js';
import * as styles from './row-header-css.js';

export class TableRowHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  get view() {
    return this.tableViewLogic.view;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.disposables.add(
      effect(() => {
        const rowSelected = this.rowSelected$.value;
        if (rowSelected) {
          this.parentElement?.classList.add(styles.rowSelectedBg);
        } else {
          this.parentElement?.classList.remove(styles.rowSelectedBg);
        }
      })
    );
    this.disposables.addFromEvent(this.parentElement, 'mouseenter', () => {
      this.gridCell.data.hover$.value = true;
    });
    this.disposables.addFromEvent(this.parentElement, 'mouseleave', () => {
      this.gridCell.data.hover$.value = false;
    });
  }
  private readonly selectRow = () => {
    if (this.view.readonly$.value) {
      return;
    }
    this.selectionController?.toggleRow(this.rowId, this.groupKey);
  };

  get selectionController() {
    return this.tableViewLogic.selectionController;
  }

  get rowSelected$() {
    return this.gridCell.row.data.selected$;
  }

  renderDragHandle = () => {
    const dragHandlerClass = clsx(
      styles.dragHandler,
      this.rowSelected$.value && styles.rowSelectedBg,
      this.rowHover$.value && styles.show
    );
    return html`
      <div class="${styles.dragHandlerWrapper}">
        <div class="${dragHandlerClass}" @click=${this.selectRow}>
          <div class="${styles.dragHandlerIndicator}"></div>
        </div>
      </div>
    `;
  };

  get rowHover$() {
    return this.gridCell.row.data.hover$;
  }

  showCheckbox$ = computed(() => {
    return this.rowSelected$.value || this.rowHover$.value;
  });

  renderCheckbox = () => {
    const classString = clsx(
      this.rowSelected$.value && styles.rowSelectedBg,
      styles.rowSelectCheckbox,
      this.showCheckbox$.value && styles.show
    );
    return html`
      <div @click=${this.selectRow} class="${styles.checkboxWrapper}">
        <div class="${classString}">
          ${this.rowSelected$.value
            ? CheckBoxCheckSolidIcon({ style: `color:#1E96EB` })
            : CheckBoxUnIcon()}
        </div>
      </div>
    `;
  };

  protected override render() {
    const view = this.view;

    if (view.readonly$.value) {
      return nothing;
    }

    return html`
      <div class="${styles.leftBar}">
        ${this.renderDragHandle()} ${this.renderCheckbox()}
      </div>
    `;
  }

  get rowId() {
    return this.gridCell.row.rowId;
  }

  get groupKey() {
    return this.gridCell.row.group.groupId;
  }

  @property({ attribute: false })
  accessor gridCell!: TableGridCell;

  @property({ attribute: false })
  accessor tableViewLogic!: VirtualTableViewUILogic;
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-table-row-header': TableRowHeader;
  }
}
