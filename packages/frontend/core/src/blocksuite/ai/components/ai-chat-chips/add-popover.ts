import { toast } from '@affine/component';
import type { TagMeta } from '@affine/core/components/page-list';
import type { CollectionMeta } from '@affine/core/modules/collection';
import track, { type EventArgs } from '@affine/track';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { openFilesWith } from '@blocksuite/affine/shared/utils';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { DocMeta } from '@blocksuite/affine/store';
import {
  CollectionsIcon,
  ImageIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TagsIcon,
  UploadIcon,
} from '@blocksuite/icons/lit';
import { Signal } from '@preact/signals-core';
import { css, html, type TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { SearchMenuConfig } from '../ai-chat-add-context';
import type { ChatChip, DocDisplayConfig } from './type';

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
  divider?: () => TemplateResult<1>;
  noResult?: () => TemplateResult<1>;
};

export type MenuItem = {
  key: string;
  name: string | TemplateResult<1>;
  icon: TemplateResult<1>;
  action: MenuAction;
  suffix?: string | TemplateResult<1>;
  testId?: string;
};

export type MenuAction = () => Promise<void> | void;

export function resolveSignal<T>(data: T | Signal<T>): T {
  return data instanceof Signal ? data.value : data;
}

export class ChatPanelAddPopover extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-add-popover {
      width: 280px;
      max-height: 450px;
      overflow-y: auto;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      border-radius: 4px;
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
      padding: 8px;
    }
    .ai-add-popover icon-button {
      justify-content: flex-start;
      gap: 8px;
    }
    .ai-add-popover icon-button svg {
      width: 20px;
      height: 20px;
    }
    .ai-add-popover .divider {
      border-top: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
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
      color: ${unsafeCSSVarV2('text/primary')};
      flex-grow: 1;
      background-color: transparent;
    }
    .search-input-wrapper input::placeholder {
      color: ${unsafeCSSVarV2('text/placeholder')};
    }
    .search-input-wrapper input:focus {
      outline: none;
    }
    .search-input-wrapper svg {
      width: 20px;
      height: 20px;
      color: ${unsafeCSSVarV2('icon/primary')};
    }
    .no-result {
      padding: 4px;
      font-size: var(--affine-font-sm);
      color: ${unsafeCSSVarV2('text/secondary')};
    }
    .menu-items icon-button {
      outline: none;
    }

    ${scrollbarStyle('.ai-add-popover')}
  `;

  private accessor _query = '';

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor docId: string | undefined;

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
        testId: 'ai-chat-with-tags',
        icon: TagsIcon(),
        action: () => {
          this._toggleMode(AddPopoverMode.Tags);
        },
      },
      {
        key: 'collections',
        name: 'Collections',
        testId: 'ai-chat-with-collections',
        icon: CollectionsIcon(),
        action: () => {
          this._toggleMode(AddPopoverMode.Collections);
        },
      },
    ],
  };

  private readonly _addFileChip = async () => {
    const files = await openFilesWith();
    if (!files || files.length === 0) return;

    this.abortController.abort();
    const images = files.filter(file => file.type.startsWith('image/'));
    if (images.length > 0) {
      this.addImages(images);
    }

    const others = files.filter(file => !file.type.startsWith('image/'));
    const addChipPromises = others.map(async file => {
      if (file.size > 50 * 1024 * 1024) {
        toast(`${file.name} is too large, please upload a file less than 50MB`);
        return;
      }
      await this.addChip({
        file,
        state: 'processing',
      });
    });
    await Promise.all(addChipPromises);
    this._track('file');
  };

  private readonly _addImageChip = async () => {
    const images = await openFilesWith('Images');
    if (!images) return;
    this.abortController.abort();
    this.addImages(images);
  };

  private readonly uploadGroup: MenuGroup = {
    name: 'Upload',
    items: [
      {
        key: 'images',
        name: 'Upload images',
        testId: 'ai-chat-with-images',
        icon: ImageIcon(),
        action: this._addImageChip,
      },
      {
        key: 'files',
        name: 'Upload files (pdf, txt, csv)',
        testId: 'ai-chat-with-files',
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
      const items = resolveSignal(group.items);
      const maxDisplay = group.maxDisplay ?? items.length;
      const hasMore = items.length > maxDisplay;
      if (!hasMore) {
        return group;
      }
      const more = {
        key: `${group.name} More`,
        name: resolveSignal(group.overflowText) ?? 'more',
        icon: MoreHorizontalIcon(),
        action: () => {
          this._resetMaxDisplay(group);
          this._focusSearchInput();
        },
      };
      return {
        ...group,
        items: [...items.slice(0, maxDisplay), more],
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
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor addChip!: (chip: ChatChip) => Promise<void>;

  @property({ attribute: false })
  accessor addImages!: (images: File[]) => void;

  @property({ attribute: false })
  accessor abortController!: AbortController;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId: string = 'ai-search-input';

  @property({ attribute: false })
  accessor uploadImageCount!: number;

  @query('.search-input')
  accessor searchInput!: HTMLInputElement;

  private _menuGroupAbortController = new AbortController();

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
    this._menuGroupAbortController.abort();
  }

  override render() {
    return html`<div class="ai-add-popover" data-testid="ai-add-popover">
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
        @compositionend=${this._onCompositionEnd}
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
            : (group.noResult?.() ?? this._renderNoResult())}
          ${idx < groups.length - 1
            ? (group.divider?.() ?? this._renderDivider())
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
        ({ key, name, icon, action, testId }, idx) => {
          const curIdx = startIndex + idx;
          return html`<icon-button
            width="280px"
            height="30px"
            data-id=${key}
            data-index=${curIdx}
            data-testid=${testId}
            .text=${name}
            hover=${this._activatedIndex === curIdx}
            @click=${() => action()?.catch(console.error)}
            @mousemove=${() => (this._activatedIndex = curIdx)}
          >
            ${icon}
          </icon-button>`;
        }
      )}
    </div>`;
  }

  private _onCompositionEnd(event: CompositionEvent) {
    event.stopPropagation();
    this._updateQuery((event.target as HTMLInputElement).value.trim());
  }

  private _onInput(event: InputEvent) {
    if (event.isComposing) return;
    event.stopPropagation();
    this._updateQuery((event.target as HTMLInputElement).value.trim());
  }

  private _updateQuery(query: string) {
    this._query = query;
    this._activatedIndex = 0;
    this._updateSearchGroup();
  }

  private _resetMaxDisplay(group: MenuGroup) {
    group.maxDisplay = undefined;
    this.requestUpdate();
  }

  private _updateSearchGroup() {
    this._menuGroupAbortController.abort();
    this._menuGroupAbortController = new AbortController();
    switch (this._mode) {
      case AddPopoverMode.Tags: {
        this._searchGroups = [
          this.searchMenuConfig.getTagMenuGroup(
            this._query,
            this._addTagChip,
            this._menuGroupAbortController.signal
          ),
        ];
        break;
      }
      case AddPopoverMode.Collections: {
        this._searchGroups = [
          this.searchMenuConfig.getCollectionMenuGroup(
            this._query,
            this._addCollectionChip,
            this._menuGroupAbortController.signal
          ),
        ];
        break;
      }
      default: {
        const docGroup = this.searchMenuConfig.getDocMenuGroup(
          this._query,
          this._addDocChip,
          this._menuGroupAbortController.signal
        );
        if (!this._query) {
          this._searchGroups = [docGroup];
        } else {
          const tagGroup = this.searchMenuConfig.getTagMenuGroup(
            this._query,
            this._addTagChip,
            this._menuGroupAbortController.signal
          );
          const collectionGroup = this.searchMenuConfig.getCollectionMenuGroup(
            this._query,
            this._addCollectionChip,
            this._menuGroupAbortController.signal
          );
          const nothing = html``;
          this._searchGroups = [
            {
              ...docGroup,
              divider: () => nothing,
              noResult: () => nothing,
            },
            {
              ...tagGroup,
              divider: () => nothing,
              noResult: () => nothing,
            },
            {
              ...collectionGroup,
              divider: () => this._renderDivider(),
              noResult: () => {
                const hasNoResult = this._searchGroups.every(group => {
                  return resolveSignal(group.items).length === 0;
                });
                return hasNoResult ? this._renderNoResult() : nothing;
              },
            },
          ];
        }
        break;
      }
    }
  }

  private readonly _addDocChip = async (meta: DocMeta) => {
    this.abortController.abort();
    await this.addChip({
      docId: meta.id,
      state: 'processing',
    });
    const mode = this.docDisplayConfig.getDocPrimaryMode(meta.id);
    const method = meta.id === this.docId ? 'cur-doc' : 'doc';
    this._track(method, mode);
  };

  private readonly _addTagChip = async (tag: TagMeta) => {
    this.abortController.abort();
    await this.addChip({
      tagId: tag.id,
      state: 'processing',
    });
    this._track('tags');
  };

  private readonly _addCollectionChip = async (collection: CollectionMeta) => {
    this.abortController.abort();
    await this.addChip({
      collectionId: collection.id,
      state: 'processing',
    });
    this._track('collections');
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

  private _track(
    method: EventArgs['addEmbeddingDoc']['method'],
    type?: 'page' | 'edgeless'
  ) {
    const page = this.independentMode
      ? track.$.intelligence
      : track.$.chatPanel;
    page.chatPanelInput.addEmbeddingDoc({
      control: 'addButton',
      method,
      type,
    });
  }
}
