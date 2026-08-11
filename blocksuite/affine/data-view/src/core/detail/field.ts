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
import { startDrag } from '../utils/drag.js';
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

    .field-content affine-database-number-cell .number {
      text-align: left;
      justify-content: flex-start;
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

    .field-wrapper {
      position: relative;
    }

    .drag-handle {
      position: absolute;
      left: -12px;
      top: 50%;
      transform: translateY(-50%);
      width: 12px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .field-wrapper:hover .drag-handle {
      opacity: 1;
    }

    .drag-handle-bar {
      width: 4px;
      height: 12px;
      border-radius: 2px;
      background-color: var(--affine-placeholder-color);
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

  _startDrag = (evt: PointerEvent) => {
    if (this.readonly) return;
    evt.preventDefault();
    evt.stopPropagation();
    
    const detail = this.closest('affine-data-view-record-detail');
    if (!detail) return;
    
    const preview = createDragPreview(this, evt.clientX, evt.clientY);
    const dropPreview = createDropPreview();
    let currentTargetId: string | undefined = undefined;
    let isBefore = true;

    startDrag(evt, {
      onDrag: () => undefined,
      onMove: evt => {
        preview.display(evt.clientX, evt.clientY);
        
        const fields = Array.from(detail.querySelectorAll('affine-data-view-record-field'));
        let targetField: HTMLElement | undefined;
        
        for (const field of fields) {
          const rect = field.getBoundingClientRect();
          const mid = (rect.top + rect.bottom) / 2;
          if (evt.clientY < rect.bottom) {
            targetField = field as HTMLElement;
            isBefore = evt.clientY < mid;
            break;
          }
        }

        // If evt.clientY is greater than the bottom of the last field, target the last field
        if (!targetField && fields.length > 0) {
          targetField = fields[fields.length - 1] as HTMLElement;
          isBefore = false;
        }
        
        if (targetField) {
          const rect = targetField.getBoundingClientRect();
          currentTargetId = targetField.dataset.columnId;
          dropPreview.display(rect.left, isBefore ? rect.top : rect.bottom, rect.width);
        } else {
          currentTargetId = undefined;
          dropPreview.remove();
        }
      },
      onClear: () => {
        preview.remove();
        dropPreview.remove();
      },
      onDrop: () => {
        if (currentTargetId && currentTargetId !== this.column.id) {
          this.column.move({
            id: currentTargetId,
            before: isBefore
          });
        }
      }
    });
  };

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
      <div class="field-wrapper">
        <div class="drag-handle" @pointerdown="${this._startDrag}">
          <div class="drag-handle-bar"></div>
        </div>
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

const createDragPreview = (field: RecordField, x: number, y: number) => {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.pointerEvents = 'none';
  div.style.opacity = '0.9';
  div.style.backgroundColor = 'var(--affine-background-primary-color)';
  div.style.boxShadow = 'var(--affine-shadow-2)';
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  div.style.zIndex = '9999';
  div.style.borderRadius = '4px';
  div.style.padding = '4px 8px';
  div.style.fontSize = '14px';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.border = '1px solid var(--affine-border-color)';
  div.style.color = 'var(--affine-text-primary-color)';
  div.innerText = field.column.name$.value;
  
  document.body.append(div);
  return {
    display(x: number, y: number) {
      div.style.left = `${Math.round(x + 10)}px`;
      div.style.top = `${Math.round(y + 10)}px`;
    },
    remove() {
      div.remove();
    },
  };
};

const createDropPreview = () => {
  const div = document.createElement('div');
  div.style.pointerEvents = 'none';
  div.style.position = 'fixed';
  div.style.zIndex = '9999';
  div.style.height = '2px';
  div.style.borderRadius = '1px';
  div.style.backgroundColor = 'var(--affine-primary-color)';
  div.style.boxShadow = '0px 0px 8px 0px rgba(30, 150, 235, 0.35)';
  return {
    display(x: number, y: number, width: number) {
      document.body.append(div);
      div.style.left = `${x}px`;
      div.style.top = `${y - 1}px`;
      div.style.width = `${width}px`;
    },
    remove() {
      div.remove();
    },
  };
};
