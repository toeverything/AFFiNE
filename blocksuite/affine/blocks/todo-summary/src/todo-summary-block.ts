import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import type { TodoSummaryBlockModel } from '@blocksuite/affine-model';
import { CommentProviderIdentifier } from '@blocksuite/affine-shared/services';
import {
  ArrowDownSmallIcon,
  CheckBoxCheckSolidIcon,
  CheckBoxUnIcon,
  CloseIcon,
  CommentIcon,
  SearchIcon,
  SubNodeIcon,
} from '@blocksuite/icons/lit';
import { BlockSelection, TextSelection } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  collectPageTodoRows,
  createNestingIndicators,
  filterTodoRows,
  getTodoSummaryAvailableTags,
  getTodoSummaryTagCounts,
  isTodoBlock,
} from './utils.js';

const todoSummaryStatusFilters = ['all', 'done', 'not-done'] as const;
const MAX_VISIBLE_SELECTED_TAGS = 2;
type TodoSummaryStatusFilter = (typeof todoSummaryStatusFilters)[number];
type TodoSummaryBlockProps = {
  statusFilter: TodoSummaryStatusFilter;
  tagsFilter: string[];
};
type TodoSummaryFilterModel = BlockModel<TodoSummaryBlockProps>;

const statusFilterOptions: Array<{
  label: string;
  value: TodoSummaryStatusFilter;
}> = [
  { label: 'All', value: 'all' },
  { label: 'Done', value: 'done' },
  { label: 'Not done', value: 'not-done' },
];

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
    }

    .filters {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px;
      border-bottom: 1px solid var(--affine-border-color);
    }

    .status-filter {
      display: flex;
      gap: 2px;
      padding: 0px;
      font-size: small;
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      background: var(--affine-background-secondary-color);
    }

    .status-button,
    .tags-summary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 0 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--affine-text-secondary-color);
      font: inherit;
      cursor: pointer;
    }

    .status-button {
      white-space: nowrap;
    }

    .status-button.active,
    .tags-filter[open] .tags-summary {
      background: var(--affine-background-primary-color);
      color: var(--affine-text-primary-color);
    }

    .status-button[disabled] {
      cursor: default;
      opacity: 0.5;
    }

    .tags-filter {
      position: relative;
      min-width: 150px;
      max-width: 220px;
    }

    .tags-filter.readonly {
      opacity: 0.5;
      pointer-events: none;
    }

    .tags-filter summary {
      list-style: none;
    }

    .tags-filter summary::-webkit-details-marker {
      display: none;
    }

    .tags-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: var(--affine-z-index-popover);
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 240px;
      max-height: 280px;
      padding: 8px;
      box-sizing: border-box;
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      background: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-shadow-2);
    }

    .search-field {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 0 8px;
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
      color: var(--affine-text-secondary-color);
      background: var(--affine-background-primary-color);
      box-sizing: border-box;
    }

    .search-field svg {
      flex-shrink: 0;
    }

    .search-field input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--affine-text-primary-color);
      font: inherit;
    }

    .todo-search {
      flex: 0 1 156px;
      min-width: 140px;
      max-width: 156px;
    }

    .filter-inputs {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }

    .tags-summary {
      width: 100%;
      justify-content: space-between;
      border: 1px solid var(--affine-border-color);
      background: var(--affine-background-secondary-color);
      box-sizing: border-box;
    }

    .tags-summary-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .tags-summary-text {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
    }

    .tags-summary-label {
      flex-shrink: 0;
      color: var(--affine-text-secondary-color);
    }

    .tags-summary-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      overflow: hidden;
    }

    .tag-badge {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      height: 20px;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--affine-background-secondary-color);
      color: var(--affine-text-primary-color);
      font-size: var(--affine-font-xs);
      line-height: 20px;
      white-space: nowrap;
    }

    .tag-badge.ghost {
      color: var(--affine-text-secondary-color);
    }

    .tag-badge.active {
      background: var(--affine-blue-100);
      color: var(--affine-blue-700);
    }

    .tag-badge.overflow {
      flex-shrink: 0;
    }

    .tags-clear {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--affine-text-secondary-color);
      cursor: pointer;
    }

    .tags-clear:hover {
      background: var(--affine-hover-color);
      color: var(--affine-text-primary-color);
    }

    .tags-clear svg {
      width: 12px;
      height: 12px;
    }

    .tag-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: auto;
    }

    .tag-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      min-height: 30px;
      padding: 4px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--affine-text-primary-color);
      cursor: pointer;
      font: inherit;
      text-align: left;
    }

    .tag-row:hover {
      background: var(--affine-hover-color);
    }

    .tag-row.active {
      background: var(--affine-hover-color-filled);
    }

    .tag-row-count {
      flex-shrink: 0;
      min-width: 20px;
      color: var(--affine-text-secondary-color);
      font-size: var(--affine-font-xs);
      text-align: right;
    }

    .table-wrapper {
      overflow: hidden;
      border-radius: 0 0 8px 8px;
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

    td.comment-cell {
      width: 40px;
      padding-left: 0;
      text-align: right;
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

    .comment-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--affine-text-secondary-color);
      cursor: pointer;
    }

    .comment-button.has-comments {
      background: var(--affine-blue-100);
      color: var(--affine-blue-700);
    }

    .comment-button > svg {
      width: 16px;
      height: 16px;
    }

    .todo-text {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
      color: var(--affine-text-primary-color);
    }

    .todo-text.checked {
      color: var(--affine-text-secondary-color);
      text-decoration: line-through;
    }

    .todo-content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
    }

    .todo-heading {
      max-width: 100%;
      overflow: hidden;
      color: var(--affine-text-secondary-color);
      font-size: var(--affine-font-xs);
      line-height: 15px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .todo-value {
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
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
      padding: 10px 12px;
      color: var(--affine-text-secondary-color);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';
    this.disposables.addFromEvent(document, 'pointerdown', event => {
      this._handleDocumentPointerDown(event);
    });
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

  private _handleCommentClick(
    row: { todoId: string; text: string; commentIds: string[] },
    event: MouseEvent
  ) {
    event.preventDefault();
    event.stopPropagation();

    const commentProvider = this.std.getOptional(CommentProviderIdentifier) as {
      addComment: (selections: Array<BlockSelection | TextSelection>) => void;
      showComments?: (commentIds: string[]) => void;
    } | null;
    if (!commentProvider) {
      return;
    }

    if (row.commentIds.length > 0) {
      commentProvider.showComments?.(row.commentIds);
      return;
    }

    if (row.text.length > 0) {
      commentProvider.addComment([
        new TextSelection({
          from: {
            blockId: row.todoId,
            index: 0,
            length: row.text.length,
          },
          to: null,
        }),
      ]);
      return;
    }

    commentProvider.addComment([
      new BlockSelection({
        blockId: row.todoId,
      }),
    ]);
  }

  private get _filterModel() {
    return this.model as unknown as TodoSummaryFilterModel;
  }

  private _getSelectedTags() {
    return Array.from(
      new Set(
        (this._filterModel.props.tagsFilter ?? []).map(tag => tag.toLowerCase())
      )
    );
  }

  private _getStatusFilter(): TodoSummaryStatusFilter {
    return this._filterModel.props.statusFilter ?? 'all';
  }

  private _setFilters(props: Partial<TodoSummaryBlockProps>) {
    if (this.store.readonly) {
      return;
    }

    this.store.captureSync();
    this.store.updateBlock(this._filterModel, props);
  }

  private _setStatusFilter(statusFilter: TodoSummaryStatusFilter) {
    if (statusFilter === this._getStatusFilter()) {
      return;
    }

    this._setFilters({ statusFilter });
  }

  private _clearTagFilters(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this._getSelectedTags().length === 0) {
      return;
    }

    this._tagSearchQuery = '';
    this._setFilters({ tagsFilter: [] });
  }

  private _handleDocumentPointerDown(event: PointerEvent) {
    const tagsFilter = this.renderRoot?.querySelector(
      '.tags-filter'
    ) as HTMLDetailsElement | null;

    if (!tagsFilter?.open) {
      return;
    }

    if (event.composedPath().includes(this)) {
      return;
    }

    tagsFilter.open = false;
    this._tagSearchQuery = '';
  }

  private _toggleTagFilter(tag: string) {
    const selectedTags = this._getSelectedTags();
    const hasTag = selectedTags.includes(tag);
    const tagsFilter = hasTag
      ? selectedTags.filter(value => value !== tag)
      : [...selectedTags, tag].sort((a, b) => a.localeCompare(b));

    this._setFilters({ tagsFilter });
  }

  private _renderFilters(
    availableTags: string[],
    tagCounts: Record<string, number>,
    selectedTags: string[],
    statusFilter: TodoSummaryStatusFilter
  ) {
    const tagSearchQuery = this._tagSearchQuery
      .trim()
      .toLowerCase()
      .replace(/^#/, '');
    const visibleTags = availableTags.filter(
      tag => !tagSearchQuery || tag.includes(tagSearchQuery)
    );
    const previewTags = selectedTags.slice(0, MAX_VISIBLE_SELECTED_TAGS);
    const overflowCount = selectedTags.length - previewTags.length;

    return html`
      <div class="filters">
        <div class="status-filter">
          ${statusFilterOptions.map(option => {
            const active = option.value === statusFilter;

            return html`
              <button
                class=${classMap({
                  'status-button': true,
                  active,
                })}
                ?disabled=${this.store.readonly}
                @click=${() => this._setStatusFilter(option.value)}
              >
                ${option.label}
              </button>
            `;
          })}
        </div>

        <div class="filter-inputs">
          <details
            class=${classMap({
              'tags-filter': true,
              readonly: this.store.readonly,
            })}
            @toggle=${(event: Event) => {
              if (!(event.currentTarget as HTMLDetailsElement).open) {
                this._tagSearchQuery = '';
              }
            }}
          >
            <summary class="tags-summary">
              <span class="tags-summary-text">
                <span class="tags-summary-label">Tags</span>
                <span class="tags-summary-badges">
                  ${selectedTags.length > 0
                    ? html`
                        ${previewTags.map(
                          tag => html`
                            <span class="tag-badge active">${tag}</span>
                          `
                        )}
                        ${overflowCount > 0
                          ? html`
                              <span class="tag-badge overflow">
                                +${overflowCount}
                              </span>
                            `
                          : nothing}
                      `
                    : nothing}
                </span>
              </span>
              <span class="tags-summary-actions">
                ${selectedTags.length > 0
                  ? html`
                      <button
                        class="tags-clear"
                        aria-label="Clear selected tags"
                        @click=${(event: Event) => this._clearTagFilters(event)}
                      >
                        ${CloseIcon({ width: '12px', height: '12px' })}
                      </button>
                    `
                  : nothing}
                ${ArrowDownSmallIcon({ width: '16px', height: '16px' })}
              </span>
            </summary>
            <div class="tags-dropdown">
              <label class="search-field">
                ${SearchIcon()}
                <input
                  type="text"
                  .value=${this._tagSearchQuery}
                  placeholder="Search tags"
                  @input=${(event: InputEvent) => {
                    this._tagSearchQuery = (
                      event.target as HTMLInputElement
                    ).value;
                  }}
                />
              </label>

              <div class="tag-list">
                ${visibleTags.length > 0
                  ? visibleTags.map(
                      tag => html`
                        <button
                          class=${classMap({
                            'tag-row': true,
                            active: selectedTags.includes(tag),
                          })}
                          ?disabled=${this.store.readonly}
                          @click=${() => this._toggleTagFilter(tag)}
                        >
                          <span
                            class=${classMap({
                              'tag-badge': true,
                              active: selectedTags.includes(tag),
                            })}
                          >
                            ${tag}
                          </span>
                          <span class="tag-row-count"
                            >${tagCounts[tag] ?? 0}</span
                          >
                        </button>
                      `
                    )
                  : html`<div class="empty">No tags in current list</div>`}
              </div>
            </div>
          </details>

          <label class="search-field todo-search">
            ${SearchIcon()}
            <input
              type="text"
              .value=${this._searchQuery}
              placeholder="Search todos"
              @input=${(event: InputEvent) => {
                this._searchQuery = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
        </div>
      </div>
    `;
  }

  override renderBlock() {
    const rows = collectPageTodoRows(this.store.root);
    const selectedTags = this._getSelectedTags();
    const statusFilter = this._getStatusFilter();
    const filteredRows = filterTodoRows(rows, {
      statusFilter,
      selectedTags,
      searchQuery: this._searchQuery,
    });
    const tagCounts = getTodoSummaryTagCounts(filteredRows);
    const availableTags = Array.from(
      new Set([...selectedTags, ...getTodoSummaryAvailableTags(filteredRows)])
    ).sort((a, b) => a.localeCompare(b));

    if (rows.length === 0) {
      return html`<div class="todo-summary">
        <div class="empty">No todos in this page</div>
      </div>`;
    }

    return html`
      <div class="todo-summary">
        ${this._renderFilters(
          availableTags,
          tagCounts,
          selectedTags,
          statusFilter
        )}
        ${filteredRows.length === 0
          ? html`<div class="empty">No todos match current filters</div>`
          : html`
              <div class="table-wrapper">
                <table>
                  <tbody>
                    ${repeat(
                      filteredRows,
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
                                ? CheckBoxCheckSolidIcon({
                                    style: 'color: #1E96EB',
                                  })
                                : CheckBoxUnIcon()}
                            </button>
                          </td>
                          <td>
                            <div class="todo-content">
                              ${row.heading
                                ? html`<span class="todo-heading"
                                    >${`${row.heading.text}`}</span
                                  >`
                                : nothing}
                              <div
                                class=${classMap({
                                  'todo-text': true,
                                  checked: row.checked,
                                })}
                              >
                                ${row.nestingLevel > 0
                                  ? html`<span class="nested-icons">
                                      ${createNestingIndicators(
                                        row.nestingLevel
                                      ).map(
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
                            </div>
                          </td>
                          <td class="comment-cell">
                            <button
                              class=${classMap({
                                'comment-button': true,
                                'has-comments': row.commentIds.length > 0,
                              })}
                              data-has-comments=${row.commentIds.length > 0
                                ? 'true'
                                : 'false'}
                              aria-label=${row.commentIds.length > 0
                                ? 'Show todo comments'
                                : 'Add todo comment'}
                              @click=${(event: MouseEvent) =>
                                this._handleCommentClick(row, event)}
                            >
                              ${CommentIcon()}
                            </button>
                          </td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              </div>
            `}
      </div>
    `;
  }

  override accessor blockContainerStyles = { margin: '12px 0' };

  override accessor useZeroWidth = true;

  @state()
  private accessor _version = 0;

  @state()
  private accessor _searchQuery = '';

  @state()
  private accessor _tagSearchQuery = '';
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-todo-summary': TodoSummaryBlockComponent;
  }
}
