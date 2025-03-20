import { toast } from '@affine/component';
import type {
  CollectionMeta,
  TagMeta,
} from '@affine/core/components/page-list';
import { ShadowlessElement } from '@blocksuite/affine/block-std';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { openFileOrFiles } from '@blocksuite/affine/shared/utils';
import {
  CollectionsIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TagsIcon,
  UploadIcon,
} from '@blocksuite/icons/lit';
import type { DocMeta } from '@blocksuite/store';
import { Signal } from '@preact/signals-core';
import { css, html, type TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { SearchMenuConfig } from '../chat-config';
import type { ChatChip } from '../chat-context';

enum AddPopoverMode {
  Default = 'default',
  Tags = 'tags',
  Collections = 'collections',
}

export type MenuGroup = {
  name: string;
  items: MenuItem[] | Signal<MenuItem[]>;
  maxDisplay?: number;
  overflowText?: string | Signal<string>;
  divider?: TemplateResult<1>;
  noResult?: TemplateResult<1>;
};

export type MenuItem = {
  key: string;
  name: string | TemplateResult<1>;
  icon: TemplateResult<1>;
  action: MenuAction;
  suffix?: string | TemplateResult<1>;
};

export type MenuAction = () => Promise<void> | void;

export function resolveSignal<T>(data: T | Signal<T>): T {
  return data instanceof Signal ? data.value : data;
}

export class ChatPanelAddPopover extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .add-popover {
      width: 280px;
      max-height: 450px;
      overflow-y: auto;
      border: 0.5px solid var(--affine-border-color);
      border-radius: 4px;
      background: var(--affine-background-primary-color);
      box-shadow: var(--affine-shadow-2);
      padding: 8px;
    }
    .add-popover icon-button {
      justify-content: flex-start;
      gap: 8px;
    }
    .add-popover icon-button svg {
      width: 20px;
      height: 20px;
    }
    .add-popover .divider {
      border-top: 0.5px solid var(--affine-border-color);
      margin: 8px 0;
    }
    .search-input-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px;
    }
    .search-input-wrapper input {
      border: none;
      line-height: 20px;
      height: 20px;
      font-size: var(--affine-font-sm);
      color: var(--affine-text-primary-color);
      flex-grow: 1;
    }
    .search-input-wrapper input::placeholder {
      color: var(--affine-placeholder-color);
    }
    .search-input-wrapper input:focus {
      outline: none;
    }
    .search-input-wrapper svg {
      width: 20px;
      height: 20px;
      color: var(--affine-v2-icon-primary);
    }
    .no-result {
      padding: 4px;
      font-size: var(--affine-font-sm);
      color: var(--affine-text-secondary-color);
    }
    .menu-items icon-button {
      outline: none;
    }
    .item-suffix {
      margin-left: auto;
      font-size: var(--affine-font-xs);
      color: var(--affine-text-secondary-color);
    }

    ${scrollbarStyle('.add-popover')}
  `;

  @state()
  private accessor _query = '';

  @state()
  private accessor _searchGroups: MenuGroup[] = [];

  private readonly _toggleMode = (mode: AddPopoverMode) => {
    this._mode = mode;
    this._activatedIndex = 0;
    this._query = '';
    this._updateSearchGroup();
    this._focusSearchInput();
  };

  private _focusSearchInput() {
    requestAnimationFrame(() => {
      this.searchInput.focus();
    });
  }

  private readonly tcGroup: MenuGroup = {
    name: 'Tag & Collection',
    items: [
      {
        key: 'tags',
        name: 'Tags',
        icon: TagsIcon(),
        action: () => {
          this._toggleMode(AddPopoverMode.Tags);
        },
      },
      {
        key: 'collections',
        name: 'Collections',
        icon: CollectionsIcon(),
        action: () => {
          this._toggleMode(AddPopoverMode.Collections);
        },
      },
    ],
  };

  private readonly _addFileChip = async () => {
    const file = await openFileOrFiles();
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast('You can only upload files less than 50MB');
      return;
    }
    this.addChip({
      file,
      state: 'processing',
    });
    this.abortController.abort();
  };

  private readonly uploadGroup: MenuGroup = {
    name: 'Upload',
    items: [
      {
        key: 'files',
        name: 'Upload files (pdf, txt, csv)',
        icon: UploadIcon(),
        action: this._addFileChip,
      },
    ],
  };

  private get _menuGroup() {
    let groups: MenuGroup[] = [];

    switch (this._mode) {
      case AddPopoverMode.Tags:
        groups = this._searchGroups;
        break;
      case AddPopoverMode.Collections:
        groups = this._searchGroups;
        break;
      default:
        if (this._query) {
          groups = [...this._searchGroups, this.uploadGroup];
        } else {
          groups = [...this._searchGroups, this.tcGroup, this.uploadGroup];
        }
    }

    // Process maxDisplay for each group
    return groups.map(group => {
      let items = resolveSignal(group.items);
      const maxDisplay = group.maxDisplay ?? items.length;
      const hasMore = items.length > maxDisplay;
      if (!hasMore) {
        return group;
      }
      return {
        ...group,
        items: [
          ...items.slice(0, maxDisplay),
          {
            key: `${group.name} More`,
            name: resolveSignal(group.overflowText) ?? 'more',
            icon: MoreHorizontalIcon(),
            action: () => {
              this._resetMaxDisplay(group);
              this._focusSearchInput();
            },
          },
        ],
      };
    });
  }

  private get _flattenMenuGroup() {
    return this._menuGroup.flatMap(group => {
      return resolveSignal(group.items);
    });
  }

  @state()
  private accessor _activatedIndex = 0;

  @state()
  private accessor _mode: AddPopoverMode = AddPopoverMode.Default;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor addChip!: (chip: ChatChip) => void;

  @property({ attribute: false })
  accessor abortController!: AbortController;

  @query('.search-input')
  accessor searchInput!: HTMLInputElement;

  override connectedCallback() {
    super.connectedCallback();
    this._updateSearchGroup();
    document.addEventListener('keydown', this._handleKeyDown);
  }

  override firstUpdated() {
    this._focusSearchInput();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeyDown);
  }

  override render() {
    return html`<div class="add-popover">
      ${this._renderSearchInput()} ${this._renderDivider()}
      ${this._renderMenuGroup(this._menuGroup)}
    </div>`;
  }

  private _renderSearchInput() {
    return html`<div class="search-input-wrapper">
      ${SearchIcon()}
      <input
        class="search-input"
        type="text"
        placeholder=${this._getPlaceholder()}
        .value=${this._query}
        @input=${this._onInput}
      />
    </div>`;
  }

  private _getPlaceholder() {
    switch (this._mode) {
      case AddPopoverMode.Tags:
        return 'Search tags';
      case AddPopoverMode.Collections:
        return 'Search collections';
      default:
        return 'Search docs, tags, collections';
    }
  }

  private _renderDivider() {
    return html`<div class="divider"></div>`;
  }

  private _renderNoResult() {
    return html`<div class="no-result">No Result</div>`;
  }

  private _renderMenuGroup(groups: MenuGroup[]) {
    let startIndex = 0;
    return repeat(
      groups,
      group => group.name,
      (group, idx) => {
        const items = resolveSignal(group.items);

        const menuGroup = html`<div class="menu-group">
          ${items.length > 0
            ? this._renderMenuItems(items, startIndex)
            : (group.noResult ?? this._renderNoResult())}
          ${idx < groups.length - 1
            ? (group.divider ?? this._renderDivider())
            : ''}
        </div>`;
        startIndex += items.length;
        return menuGroup;
      }
    );
  }

  private _renderMenuItems(items: MenuItem[], startIndex: number) {
    return html`<div class="menu-items">
      ${repeat(
        items,
        item => item.key,
        ({ key, name, icon, action, suffix }, idx) => {
          const curIdx = startIndex + idx;
          return html`<icon-button
            width="280px"
            height="30px"
            data-id=${key}
            data-index=${curIdx}
            .text=${name}
            hover=${this._activatedIndex === curIdx}
            @click=${() => action()?.catch(console.error)}
            @mousemove=${() => (this._activatedIndex = curIdx)}
          >
            ${icon}
            ${suffix ? html`<div class="item-suffix">${suffix}</div>` : ''}
          </icon-button>`;
        }
      )}
    </div>`;
  }

  private _onInput(event: Event) {
    this._query = (event.target as HTMLInputElement).value;
    this._activatedIndex = 0;
    this._updateSearchGroup();
  }

  private _resetMaxDisplay(group: MenuGroup) {
    group.maxDisplay = undefined;
    this.requestUpdate();
  }

  private _updateSearchGroup() {
    switch (this._mode) {
      case AddPopoverMode.Tags: {
        this._searchGroups = [
          this.searchMenuConfig.getTagMenuGroup(
            this._query,
            this._addTagChip,
            this.abortController.signal
          ),
        ];
        break;
      }
      case AddPopoverMode.Collections: {
        this._searchGroups = [
          this.searchMenuConfig.getCollectionMenuGroup(
            this._query,
            this._addCollectionChip,
            this.abortController.signal
          ),
        ];
        break;
      }
      default: {
        const docGroup = this.searchMenuConfig.getDocMenuGroup(
          this._query,
          this._addDocChip,
          this.abortController.signal
        );
        if (!this._query) {
          this._searchGroups = [docGroup];
        } else {
          const tagGroup = this.searchMenuConfig.getTagMenuGroup(
            this._query,
            this._addTagChip,
            this.abortController.signal
          );
          const collectionGroup = this.searchMenuConfig.getCollectionMenuGroup(
            this._query,
            this._addCollectionChip,
            this.abortController.signal
          );
          const hasNoResult =
            resolveSignal(docGroup.items).length === 0 &&
            resolveSignal(tagGroup.items).length === 0 &&
            resolveSignal(collectionGroup.items).length === 0;
          if (hasNoResult) {
            this._searchGroups = [
              {
                name: 'No Result',
                items: [],
              },
            ];
          } else {
            const nothing = html``;
            this._searchGroups = [
              {
                ...docGroup,
                divider: nothing,
                noResult: nothing,
              },
              {
                ...tagGroup,
                divider: nothing,
                noResult: nothing,
              },
              {
                ...collectionGroup,
                noResult: nothing,
              },
            ];
          }
        }
        break;
      }
    }
  }

  private readonly _addDocChip = (meta: DocMeta) => {
    this.addChip({
      docId: meta.id,
      state: 'processing',
    });
    this.abortController.abort();
  };

  private readonly _addTagChip = (_tag: TagMeta) => {
    this.abortController.abort();
  };

  private readonly _addCollectionChip = (_collection: CollectionMeta) => {
    this.abortController.abort();
  };

  private readonly _handleKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;

    const { key } = event;

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const totalItems = this._flattenMenuGroup.length;
      if (totalItems === 0) return;

      if (key === 'ArrowDown') {
        this._activatedIndex = (this._activatedIndex + 1) % totalItems;
      } else if (key === 'ArrowUp') {
        this._activatedIndex =
          (this._activatedIndex - 1 + totalItems) % totalItems;
      }
      this._scrollItemIntoView();
    } else if (key === 'Enter') {
      event.preventDefault();
      this._flattenMenuGroup[this._activatedIndex]
        .action()
        ?.catch(console.error);
    } else if (key === 'Escape') {
      event.preventDefault();
      this.abortController.abort();
    }
  };

  private _scrollItemIntoView() {
    requestAnimationFrame(() => {
      const element = this.renderRoot.querySelector(
        `[data-index="${this._activatedIndex}"]`
      );
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    });
  }
}
