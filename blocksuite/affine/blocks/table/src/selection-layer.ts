import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, effect, signal } from '@preact/signals-core';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { SelectionController } from './selection-controller';

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export const SelectionLayerComponentName = 'affine-table-selection-layer';
export class SelectionLayer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor selectionController!: SelectionController;
  @property({ attribute: false })
  accessor getRowRect!: (rowId: string) => Rect;
  @property({ attribute: false })
  accessor getColumnRect!: (columnId: string) => Rect;
  @property({ attribute: false })
  accessor getAreaRect!: (
    rowStartIndex: number,
    rowEndIndex: number,
    columnStartIndex: number,
    columnEndIndex: number
  ) => Rect;

  selection$ = computed(() => {
    return this.selectionController.selected$.value;
  });

  computeRect = () => {
    const selection = this.selection$.value;
    if (!selection) return;
    if (selection.type === 'row') {
      const rect = this.getRowRect(selection.rowId);
      return rect;
    }
    if (selection.type === 'column') {
      const rect = this.getColumnRect(selection.columnId);
      return rect;
    }
    if (selection.type === 'area') {
      const rect = this.getAreaRect(
        selection.rowStartIndex,
        selection.rowEndIndex,
        selection.columnStartIndex,
        selection.columnEndIndex
      );
      return rect;
    }
    return;
  };

  rect$ = signal<Rect>();

  private getSelectionStyle() {
    const rect = this.rect$.value;
    if (!rect)
      return styleMap({
        display: 'none',
      });
    const border = '2px solid var(--affine-primary-color)';

    return styleMap({
      position: 'absolute',
      pointerEvents: 'none',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: '2px',
      border,
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    const ob = new ResizeObserver(() => {
      this.rect$.value = this.computeRect();
    });
    this.disposables.add(
      effect(() => {
        this.rect$.value = this.computeRect();
      })
    );
    const table = this.selectionController.host.querySelector('table');
    if (table) {
      ob.observe(table);
      this.disposables.add(() => {
        ob.unobserve(table);
      });
    }
  }

  override render() {
    return html` <div style=${this.getSelectionStyle()}></div> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [SelectionLayerComponentName]: SelectionLayer;
  }
}
