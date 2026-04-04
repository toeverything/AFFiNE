import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import type { TodoSummaryBlockModel } from '@blocksuite/affine-model';
import {
  CheckBoxCheckSolidIcon,
  CheckBoxUnIcon,
  SubNodeIcon,
} from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  collectPageTodoRows,
  createNestingIndicators,
  isTodoBlock,
} from './utils.js';

export class TodoSummaryBlockComponent extends CaptionedBlockComponent<TodoSummaryBlockModel> {
  static override styles = css`
    affine-todo-summary {
      display: block;
      font-size: var(--affine-font-base);
    }

    .todo-summary {
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      background: var(--affine-background-primary-color);
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    tr {
      cursor: pointer;
    }

    tr + tr {
      border-top: 1px solid var(--affine-border-color);
    }

    tr:hover {
      background: var(--affine-hover-color);
    }

    td {
      padding: 10px 12px;
      vertical-align: middle;
    }

    td:first-child {
      width: 40px;
      padding-right: 0;
    }

    .checkbox {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--affine-icon-color);
      cursor: pointer;
    }

    .checkbox[disabled] {
      cursor: default;
    }

    .checkbox > svg {
      width: 20px;
      height: 20px;
    }

    .todo-text {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--affine-text-primary-color);
    }

    .todo-text.checked {
      color: var(--affine-text-secondary-color);
      text-decoration: line-through;
    }

    .todo-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nested-icon {
      display: flex;
      align-items: center;
      color: var(--affine-text-secondary-color);
      flex-shrink: 0;
    }

    .nested-icons {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    .empty {
      padding: 12px;
      color: var(--affine-text-secondary-color);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';
    this.disposables.add(
      this.store.slots.blockUpdated.subscribe(() => {
        this._version++;
      })
    );
  }

  private _jumpToTodo(todoId: string) {
    const block = this.std.view.getBlock(todoId);
    if (!block) {
      return;
    }

    this.host.selection.setGroup('note', [
      this.host.selection.create(BlockSelection, {
        blockId: todoId,
      }),
    ]);

    requestAnimationFrame(() => {
      block.scrollIntoView({
        behavior: 'instant',
        block: 'center',
      });
    });
  }

  private _toggleTodo(todoId: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (this.store.readonly) {
      return;
    }

    const model = this.store.getBlock(todoId)?.model;
    if (!isTodoBlock(model)) {
      return;
    }

    this.store.captureSync();
    this.store.updateBlock(model, {
      checked: !model.props.checked,
    });
  }

  override renderBlock() {
    const rows = collectPageTodoRows(this.store.root);
    if (rows.length === 0) {
      return html`<div class="todo-summary">
        <div class="empty">No todos in this page</div>
      </div>`;
    }

    return html`
      <div class="todo-summary">
        <table>
          <tbody>
            ${repeat(
              rows,
              row => row.todoId,
              row => html`
                <tr @click=${() => this._jumpToTodo(row.todoId)}>
                  <td>
                    <button
                      class="checkbox"
                      ?disabled=${this.store.readonly}
                      aria-label=${row.checked
                        ? 'Mark todo unchecked'
                        : 'Mark todo checked'}
                      aria-checked=${row.checked ? 'true' : 'false'}
                      @click=${(event: MouseEvent) =>
                        this._toggleTodo(row.todoId, event)}
                    >
                      ${row.checked
                        ? CheckBoxCheckSolidIcon({ style: 'color: #1E96EB' })
                        : CheckBoxUnIcon()}
                    </button>
                  </td>
                  <td>
                    <div
                      class=${classMap({
                        'todo-text': true,
                        checked: row.checked,
                      })}
                    >
                      ${row.nestingLevel > 0
                        ? html`<span class="nested-icons">
                            ${createNestingIndicators(row.nestingLevel).map(
                              level =>
                                html`<span
                                  class="nested-icon"
                                  data-level=${level}
                                  >${SubNodeIcon({
                                    width: '14px',
                                    height: '14px',
                                  })}</span
                                >`
                            )}
                          </span>`
                        : nothing}
                      <span class="todo-value">${row.text}</span>
                    </div>
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  override accessor blockContainerStyles = { margin: '12px 0' };

  override accessor useZeroWidth = true;

  @state()
  private accessor _version = 0;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-todo-summary': TodoSummaryBlockComponent;
  }
}
