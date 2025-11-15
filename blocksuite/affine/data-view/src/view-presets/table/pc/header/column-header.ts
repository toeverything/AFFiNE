import { getScrollContainer } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { autoUpdate } from '@floating-ui/dom';
import { nothing, type TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { cellDivider } from '../../styles.js';
import type { TableGroup } from '../group.js';
import { tableStyle } from '../table-view-style';
import { type TableViewUILogic } from '../table-view-ui-logic.js';
import { styles } from './styles.js';

export class DatabaseColumnHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly _onAddColumn = (e: MouseEvent) => {
    if (this.readonly) return;
    this.tableViewManager.propertyAdd('end');
    const ele = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      this.editLastColumnTitle();
      ele.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  editLastColumnTitle = () => {
    const columns = this.querySelectorAll('affine-database-header-column');
    const column = columns.item(columns.length - 1);
    column.editTitle();
  };

  preMove = 0;

  private get readonly() {
    return this.tableViewManager.readonly$.value;
  }

  private autoSetHeaderPosition(
    group: TableGroup,
    scrollContainer: HTMLElement
  ) {
    const referenceRect = group.getBoundingClientRect();
    const floatingRect = this.getBoundingClientRect();
    const rootRect = scrollContainer.getBoundingClientRect();
    let moveX = 0;
    if (rootRect.top > referenceRect.top) {
      moveX =
        Math.min(referenceRect.bottom - floatingRect.height, rootRect.top) -
        referenceRect.top;
    }
    if (moveX === 0 && this.preMove === 0) {
      return;
    }
    this.preMove = moveX;
    this.style.transform = `translate3d(0,${moveX / this.getScale()}px,0)`;
  }

  override connectedCallback() {
    super.connectedCallback();
    const scrollContainer = getScrollContainer(
      this.closest('affine-data-view-renderer')!
    );
    const group = this.closest('affine-data-view-table-group');
    if (group) {
      const cancel = autoUpdate(group, this, () => {
        if (!scrollContainer) {
          return;
        }
        this.autoSetHeaderPosition(group, scrollContainer);
      });
      this.disposables.add(cancel);
    }
  }

  getScale() {
    return this.scaleDiv?.getBoundingClientRect().width ?? 1;
  }

  override render() {
    return html`
      ${this.renderGroupHeader?.()}
      <div class="affine-database-column-header database-row">
        ${this.readonly
          ? nothing
          : html`<div class="${tableStyle.leftToolBarStyle}"></div>`}
        ${repeat(
          this.tableViewManager.properties$.value,
          column => column.id,
          (column, index) => {
            const style = styleMap({
              width: `${column.width$.value}px`,
              border: index === 0 ? 'none' : undefined,
            });
            return html`
              <affine-database-header-column
                style="${style}"
                data-column-id="${column.id}"
                data-column-index="${index}"
                class="affine-database-column database-cell"
                .column="${column}"
                .tableViewLogic="${this.tableViewLogic}"
              ></affine-database-header-column>
              <div class="${cellDivider}" style="height: auto;"></div>
            `;
          }
        )}
        <div
          @click="${this._onAddColumn}"
          class="header-add-column-button dv-hover"
        >
          ${PlusIcon()}
        </div>
        <div class="scale-div" style="width: 1px;height: 1px;"></div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor renderGroupHeader: (() => TemplateResult) | undefined;

  @query('.scale-div')
  accessor scaleDiv!: HTMLDivElement;

  @property({ attribute: false })
  accessor tableViewLogic!: TableViewUILogic;

  get tableViewManager() {
    return this.tableViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-column-header': DatabaseColumnHeader;
  }
}
