import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  DeleteIcon,
  DuplicateIcon,
  MoveLeftIcon,
  MoveRightIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, signal } from '@preact/signals-core';
import { css } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { html } from 'lit/static-html.js';

import { inputConfig, typeConfig } from '../common/property-menu.js';
import type {
  CellRenderProps,
  DataViewCellLifeCycle,
} from '../property/index.js';
import { renderUniLit } from '../utils/uni-component/uni-component.js';
import type { Property } from '../view-manager/property.js';
import type { SingleView } from '../view-manager/single-view.js';

export class RecordField extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-data-view-record-field {
      display: flex;
      gap: 12px;
    }

    .field-left {
      padding: 6px;
      display: flex;
      height: max-content;
      align-items: center;
      gap: 6px;
      font-size: var(--data-view-cell-text-size);
      line-height: var(--data-view-cell-text-line-height);
      color: var(--affine-text-secondary-color);
      width: 160px;
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
    }

    .field-left:hover {
      background-color: var(--affine-hover-color);
    }

    affine-data-view-record-field .icon {
      display: flex;
      align-items: center;
      width: 16px;
      height: 16px;
    }

    affine-data-view-record-field .icon svg {
      width: 16px;
      height: 16px;
      fill: var(--affine-icon-color);
    }

    .filed-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .field-content {
      padding: 6px 8px;
      border-radius: 4px;
      flex: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      border: 1px solid transparent;
    }

    .field-content .affine-database-number {
      text-align: left;
      justify-content: start;
    }

    .field-content:hover {
      background-color: var(--affine-hover-color);
    }

    .field-content.is-editing {
      box-shadow: 0px 0px 0px 2px rgba(30, 150, 235, 0.3);
    }

    .field-content.is-focus {
      border: 1px solid var(--affine-primary-color);
    }

    .field-content.empty::before {
      content: 'Empty';
      color: var(--affine-text-disable-color);
      font-size: 14px;
      line-height: 22px;
    }
  `;

  private readonly _cell = signal<DataViewCellLifeCycle>();

  _click = (e: MouseEvent) => {
    e.stopPropagation();
    if (this.readonly) return;

    this.changeEditing(true);
  };

  _clickLeft = (e: MouseEvent) => {
    if (this.readonly) return;
    const ele = e.currentTarget as HTMLElement;
    const properties = this.view.detailProperties$.value;
    popMenu(popupTargetFromElement(ele), {
      options: {
        title: {
          text: 'Property settings',
        },
        items: [
          menu.group({
            items: [inputConfig(this.column), typeConfig(this.column)],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Move Up',
                prefix: html` <div
                  style="transform: rotate(90deg);display:flex;align-items:center;"
                >
                  ${MoveLeftIcon()}
                </div>`,
                hide: () =>
                  properties.findIndex(
                    property => property.id === this.column.id
                  ) === 0,
                select: () => {
                  const prev = this.column.prev$.value;
                  if (!prev) {
                    return;
                  }
                  this.column.move({
                    id: prev.id,
                    before: true,
                  });
                },
              }),
              menu.action({
                name: 'Move Down',
                prefix: html` <div
                  style="transform: rotate(90deg);display:flex;align-items:center;"
                >
                  ${MoveRightIcon()}
                </div>`,
                hide: () =>
                  properties.findIndex(
                    property => property.id === this.column.id
                  ) ===
                  properties.length - 1,
                select: () => {
                  const next = this.column.next$.value;
                  if (!next) {
                    return;
                  }
                  this.column.move({
                    id: next.id,
                    before: false,
                  });
                },
              }),
            ],
          }),
          menu.group({
            name: 'operation',
            items: [
              menu.action({
                name: 'Duplicate',
                prefix: DuplicateIcon(),
                hide: () => !this.column.canDuplicate,
                select: () => {
                  this.column.duplicate?.();
                },
              }),
              menu.action({
                name: 'Delete',
                prefix: DeleteIcon(),
                hide: () => !this.column.canDelete,
                select: () => {
                  this.column.delete?.();
                },
                class: { 'delete-item': true },
              }),
            ],
          }),
        ],
      },
    });
  };

  @property({ attribute: false })
  accessor column!: Property;

  @property({ attribute: false })
  accessor rowId!: string;

  cell$ = computed(() => {
    return this.column.cellGetOrCreate(this.rowId);
  });

  changeEditing = (editing: boolean) => {
    const selection = this.closest('affine-data-view-record-detail')?.selection;
    if (selection) {
      selection.selection = {
        propertyId: this.column.id,
        isEditing: editing,
      };
    }
  };

  get cell(): DataViewCellLifeCycle | undefined {
    return this._cell.value;
  }

  private get readonly() {
    return this.view.readonly$.value;
  }

  override render() {
    const column = this.column;

    const props: CellRenderProps = {
      cell: this.cell$.value,
      isEditing$: this.isEditing$,
      selectCurrentCell: this.changeEditing,
    };
    const renderer = this.column.renderer$.value;
    if (!renderer) {
      return;
    }
    const { view } = renderer;
    const contentClass = classMap({
      'field-content': true,
      empty: !this.isEditing$.value && this.cell$.value.isEmpty$.value,
      'is-editing': this.isEditing$.value,
      'is-focus': this.isFocus$.value,
    });
    return html`
      <div>
        <div class="field-left" @click="${this._clickLeft}">
          <div class="icon">
            <uni-lit .uni="${this.column.icon}"></uni-lit>
          </div>
          <div class="filed-name">${column.name$.value}</div>
        </div>
      </div>
      <div @click="${this._click}" class="${contentClass}">
        ${renderUniLit(view, props, {
          ref: this._cell,
          class: 'kanban-cell',
        })}
      </div>
    `;
  }

  isEditing$ = signal(false);

  isFocus$ = signal(false);

  @property({ attribute: false })
  accessor view!: SingleView;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-record-field': RecordField;
  }
}
