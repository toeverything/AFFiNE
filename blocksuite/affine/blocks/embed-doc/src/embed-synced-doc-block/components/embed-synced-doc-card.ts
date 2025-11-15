import { RENDER_CARD_THROTTLE_MS } from '@blocksuite/affine-block-embed';
import { LoadingIcon } from '@blocksuite/affine-components/icons';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { WithDisposable } from '@blocksuite/global/lit';
import { ResetIcon } from '@blocksuite/icons/lit';
import {
  BlockSelection,
  isGfxBlockComponent,
  ShadowlessElement,
} from '@blocksuite/std';
import { html, nothing } from 'lit';
import { property, queryAsync } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import throttle from 'lodash-es/throttle';

import { renderLinkedDocInCard } from '../../common/render-linked-doc';
import type { EmbedSyncedDocBlockComponent } from '../embed-synced-doc-block.js';
import { cardStyles } from '../styles.js';
import { getSyncedDocIcons } from '../utils.js';

export class EmbedSyncedDocCard extends WithDisposable(ShadowlessElement) {
  static override styles = cardStyles;

  private _dragging = false;

  get blockState() {
    return this.block.blockState;
  }

  get editorMode() {
    return this.block.editorMode;
  }

  get host() {
    return this.block.host;
  }

  get linkedDoc() {
    return this.block.syncedDoc;
  }

  get model() {
    return this.block.model;
  }

  get std() {
    return this.block.std;
  }

  private _handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (!isGfxBlockComponent(this.block)) {
      this._selectBlock();
    }
  }

  private _isDocEmpty() {
    const syncedDoc = this.block.syncedDoc;
    if (!syncedDoc) {
      return false;
    }
    return (
      !!syncedDoc &&
      !syncedDoc.meta?.title.length &&
      this.isNoteContentEmpty &&
      this.isBannerEmpty
    );
  }

  private _selectBlock() {
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.block.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

  override connectedCallback() {
    super.connectedCallback();

    this.block.handleEvent(
      'dragStart',
      () => {
        this._dragging = true;
      },
      { global: true }
    );
    this.block.handleEvent(
      'dragEnd',
      () => {
        this._dragging = false;
      },
      { global: true }
    );

    const { isCycle } = this.block.blockState;
    const syncedDoc = this.block.syncedDoc;
    if (isCycle && syncedDoc) {
      if (syncedDoc.root) {
        renderLinkedDocInCard(this);
      } else {
        const subscription = syncedDoc.slots.rootAdded.subscribe(() => {
          subscription.unsubscribe();
          renderLinkedDocInCard(this);
        });
      }

      this.disposables.add(
        syncedDoc.workspace.slots.docListUpdated.subscribe(() => {
          renderLinkedDocInCard(this);
        })
      );
      // Should throttle the blockUpdated event to avoid too many re-renders
      // Because the blockUpdated event is triggered too frequently at some cases
      this.disposables.add(
        syncedDoc.slots.blockUpdated.subscribe(
          throttle(payload => {
            if (this._dragging) {
              return;
            }
            if (
              payload.type === 'update' &&
              ['', 'caption', 'xywh'].includes(payload.props.key)
            ) {
              return;
            }
            renderLinkedDocInCard(this);
          }, RENDER_CARD_THROTTLE_MS)
        )
      );
    }
  }

  override render() {
    const { isLoading, isDeleted, isError, isCycle } = this.blockState;
    const error = this.isError || isError;

    const isEmpty = this._isDocEmpty() && this.isBannerEmpty;

    const cardClassMap = classMap({
      loading: isLoading,
      error,
      deleted: isDeleted,
      cycle: isCycle,
      surface: isGfxBlockComponent(this.block),
      empty: isEmpty,
      'banner-empty': this.isBannerEmpty,
      'note-empty': this.isNoteContentEmpty,
    });

    const theme = this.std.get(ThemeProvider).theme;
    const {
      SyncedDocErrorIcon,
      SyncedDocEmptyBanner,
      SyncedDocErrorBanner,
      SyncedDocDeletedBanner,
    } = getSyncedDocIcons(theme, this.editorMode);

    const icon = error
      ? SyncedDocErrorIcon
      : isLoading
        ? LoadingIcon()
        : this.block.icon$.value;
    const title = isLoading ? 'Loading...' : this.block.title$;

    const showDefaultNoteContent = isLoading || error || isDeleted || isEmpty;
    const defaultNoteContent = error
      ? 'This linked doc failed to load.'
      : isLoading
        ? ''
        : isDeleted
          ? 'This linked doc is deleted.'
          : isEmpty
            ? 'Preview of the page will be displayed here.'
            : '';

    const dateText = this.block.docUpdatedAt.toLocaleString();

    const showDefaultBanner = isLoading || error || isDeleted || isEmpty;

    const defaultBanner = isLoading
      ? SyncedDocEmptyBanner
      : error
        ? SyncedDocErrorBanner
        : isDeleted
          ? SyncedDocDeletedBanner
          : SyncedDocEmptyBanner;

    return html`
      <div
        class="affine-embed-synced-doc-card ${cardClassMap}"
        @click=${this._handleClick}
      >
        <div class="affine-embed-synced-doc-card-content">
          <div class="affine-embed-synced-doc-card-content-title">
            <div class="affine-embed-synced-doc-card-content-title-icon">
              ${icon}
            </div>

            <div class="affine-embed-synced-doc-card-content-title-text">
              ${title}
            </div>
          </div>

          ${showDefaultNoteContent
            ? html`<div class="affine-embed-synced-doc-content-note default">
                ${defaultNoteContent}
              </div>`
            : nothing}
          <div class="affine-embed-synced-doc-content-note render"></div>

          ${error
            ? html`
                <div class="affine-embed-synced-doc-card-content-reload">
                  <div
                    class="affine-embed-synced-doc-card-content-reload-button"
                    @click=${() => this.block.refreshData()}
                  >
                    ${ResetIcon()} <span>Reload</span>
                  </div>
                </div>
              `
            : html`
                <div class="affine-embed-synced-doc-card-content-date">
                  <span>Updated</span>

                  <span>${dateText}</span>
                </div>
              `}
        </div>

        <div class="affine-embed-synced-doc-card-banner render"></div>

        ${showDefaultBanner
          ? html`
              <div class="affine-embed-synced-doc-card-banner default">
                ${defaultBanner}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  @queryAsync('.affine-embed-synced-doc-card-banner.render')
  accessor bannerContainer!: Promise<HTMLDivElement>;

  @property({ attribute: false })
  accessor block!: EmbedSyncedDocBlockComponent;

  @property({ attribute: false })
  accessor isBannerEmpty = false;

  @property({ attribute: false })
  accessor isError = false;

  @property({ attribute: false })
  accessor isNoteContentEmpty = false;

  @queryAsync('.affine-embed-synced-doc-content-note.render')
  accessor noteContainer!: Promise<HTMLDivElement>;
}
