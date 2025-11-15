import {
  getAttachmentFileIcon,
  LoadingIcon,
  WebIcon16,
} from '@blocksuite/affine-components/icons';
import type { FootNote } from '@blocksuite/affine-model';
import { ImageProxyService } from '@blocksuite/affine-shared/adapters';
import {
  DocDisplayMetaProvider,
  LinkPreviewServiceIdentifier,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { BlockStdScope } from '@blocksuite/std';
import { computed, signal } from '@preact/signals-core';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

import type { FootNotePopupClickHandler } from './footnote-config';

export class FootNotePopup extends SignalWatcher(WithDisposable(LitElement)) {
  static override styles = css`
    .footnote-popup-container {
      border-radius: 8px;
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
      background-color: ${unsafeCSSVarV2('layer/background/primary')};
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      max-width: 260px;
      padding: 4px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: 0.3s ease-in-out;
      cursor: pointer;
    }

    .footnote-popup-description {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      font-size: var(--affine-font-xs);
      font-style: normal;
      font-weight: 400;
      line-height: 20px;
      height: 20px;
    }
  `;

  private readonly _isLoading$ = signal(false);

  private readonly _linkPreview$ = signal<{
    favicon: string | undefined;
    title?: string;
    description?: string;
  }>({
    favicon: undefined,
    title: undefined,
    description: undefined,
  });

  private readonly _prefixIcon$ = computed(() => {
    const referenceType = this.footnote.reference.type;
    if (referenceType === 'doc') {
      const docId = this.footnote.reference.docId;
      if (!docId) {
        return undefined;
      }
      return this.std.get(DocDisplayMetaProvider).icon(docId).value;
    } else if (referenceType === 'attachment') {
      const fileType = this.footnote.reference.fileType;
      if (!fileType) {
        return undefined;
      }
      return getAttachmentFileIcon(fileType);
    } else if (referenceType === 'url') {
      if (this._isLoading$.value) {
        return LoadingIcon();
      }

      const favicon = this._linkPreview$.value?.favicon;
      const imageSrc = favicon
        ? this.imageProxyService.buildUrl(favicon)
        : undefined;
      return imageSrc ? html`<img src=${imageSrc} alt="favicon" />` : WebIcon16;
    }
    return undefined;
  });

  private readonly _popupLabel$ = computed(() => {
    const referenceType = this.footnote.reference.type;
    let label = '';
    const { docId, fileName, url } = this.footnote.reference;
    switch (referenceType) {
      case 'doc':
        if (!docId) {
          return label;
        }
        label = this.std.get(DocDisplayMetaProvider).title(docId).value;
        break;
      case 'attachment':
        if (!fileName) {
          return label;
        }
        label = fileName;
        break;
      case 'url':
        if (!url) {
          return label;
        }
        label = this._linkPreview$.value?.title ?? url;
        break;
    }
    return label;
  });

  private readonly _tooltip$ = computed(() => {
    const referenceType = this.footnote.reference.type;
    if (referenceType === 'url') {
      const title = this._linkPreview$.value?.title;
      const url = this.footnote.reference.url;
      return [title, url].filter(Boolean).join('\n') || '';
    }
    return this._popupLabel$.value;
  });

  private readonly _onClick = () => {
    this.onPopupClick(this.footnote, this.abortController);
    this.abortController.abort();
  };

  private readonly _initLinkPreviewData = () => {
    this._linkPreview$.value = {
      favicon: this.footnote.reference.favicon,
      title: this.footnote.reference.title,
      description: this.footnote.reference.description,
    };
  };

  override connectedCallback() {
    super.connectedCallback();

    this._initLinkPreviewData();

    // If the reference is a url, and the url exists
    // and the link preview data is not already set, fetch the link preview data
    const isTitleAndDescriptionEmpty =
      !this._linkPreview$.value?.title &&
      !this._linkPreview$.value?.description;
    if (
      this.footnote.reference.type === 'url' &&
      this.footnote.reference.url &&
      isTitleAndDescriptionEmpty
    ) {
      this._isLoading$.value = true;
      this.std
        .get(LinkPreviewServiceIdentifier)
        .query(this.footnote.reference.url)
        .then(data => {
          // update the local link preview data
          this._linkPreview$.value = {
            favicon: data.icon ?? undefined,
            title: data.title ?? undefined,
            description: data.description ?? undefined,
          };

          // update the footnote attributes in the node with the link preview data
          // to avoid fetching the same data multiple times
          const footnote: FootNote = {
            ...this.footnote,
            reference: {
              ...this.footnote.reference,
              ...(data.icon && { favicon: data.icon }),
              ...(data.title && { title: data.title }),
              ...(data.description && { description: data.description }),
            },
          };
          this.updateFootnoteAttributes(footnote);
        })
        .catch(console.error)
        .finally(() => {
          this._isLoading$.value = false;
        });
    }
  }

  override render() {
    const description = this._linkPreview$.value?.description;

    return html`
      <div class="footnote-popup-container" @click=${this._onClick}>
        <footnote-popup-chip
          .prefixIcon=${this._prefixIcon$.value}
          .label=${this._popupLabel$.value}
          .tooltip=${this._tooltip$.value}
        ></footnote-popup-chip>
        ${description
          ? html` <div class="footnote-popup-description">${description}</div> `
          : nothing}
      </div>
    `;
  }

  get imageProxyService() {
    return this.std.get(ImageProxyService);
  }

  @property({ attribute: false })
  accessor footnote!: FootNote;

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  @property({ attribute: false })
  accessor abortController!: AbortController;

  @property({ attribute: false })
  accessor onPopupClick: FootNotePopupClickHandler | (() => void) = () => {};

  @property({ attribute: false })
  accessor updateFootnoteAttributes: (footnote: FootNote) => void = () => {};
}
