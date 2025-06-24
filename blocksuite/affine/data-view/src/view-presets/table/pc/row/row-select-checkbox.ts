import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { CheckBoxCheckSolidIcon, CheckBoxUnIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed } from '@preact/signals-core';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { TableViewRowSelection } from '../../selection';
import type { TableViewUILogic } from '../table-view-ui-logic';

export class RowSelectCheckbox extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    row-select-checkbox {
      display: contents;
    }
    .row-select-checkbox {
      display: flex;
      align-items: center;
      background-color: var(--affine-background-primary-color);
      opacity: 0;
      cursor: pointer;
      font-size: 20px;
      color: var(--affine-icon-color);
    }
    .row-select-checkbox:hover {
      opacity: 1;
    }
    .row-select-checkbox.selected {
      opacity: 1;
    }
  `;

  @property({ attribute: false })
  accessor groupKey: string | undefined;

  @property({ attribute: false })
  accessor rowId!: string;

  @property({ attribute: false })
  accessor tableViewLogic!: TableViewUILogic;

  isSelected$ = computed(() => {
    const selection = this.tableViewLogic.selection$.value;
    if (!selection || selection.selectionType !== 'row') {
      return false;
    }
    return TableViewRowSelection.includes(selection, {
      id: this.rowId,
      groupKey: this.groupKey,
    });
  });

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'click', () => {
      this.tableViewLogic.selectionController.toggleRow(
        this.rowId,
        this.groupKey
      );
    });
  }

  override render() {
    const classString = classMap({
      'row-selected-bg': true,
      'row-select-checkbox': true,
      selected: this.isSelected$.value,
    });
    return html`
      <div class="${classString}">
        ${this.isSelected$.value
          ? CheckBoxCheckSolidIcon({ style: `color:#1E96EB` })
          : CheckBoxUnIcon()}
      </div>
    `;
  }
}
