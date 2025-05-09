import type {
  AttachmentBlockModel,
  BookmarkBlockModel,
  CodeBlockModel,
  DatabaseBlockModel,
  ImageBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
  RootBlockModel,
} from '@blocksuite/affine-model';
import { DocDisplayMetaProvider } from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { noop } from '@blocksuite/global/utils';
import { LinkedPageIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { BlockModel, DeltaInsert } from '@blocksuite/store';
import { consume } from '@lit/context';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import {
  placeholderMap,
  previewIconMap,
  type TocContext,
  tocContext,
} from '../config.js';
import { isHeadingBlock, isRootBlock } from '../utils/query.js';
import * as styles from './outline-preview.css';

function assertType<T>(value: unknown): asserts value is T {
  noop(value);
}

export const AFFINE_OUTLINE_BLOCK_PREVIEW = 'affine-outline-block-preview';

export class OutlineBlockPreview extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  private get _docDisplayMetaService() {
    return this._context.editor$.value.std.get(DocDisplayMetaProvider);
  }

  private _TextBlockPreview(block: ParagraphBlockModel | ListBlockModel) {
    const deltas: DeltaInsert<AffineTextAttributes>[] =
      block.props.text.yText.toDelta();
    if (!block.props.text.length) return nothing;
    const iconClass = this.disabledIcon ? styles.iconDisabled : styles.icon;

    const previewText = deltas.map(delta => {
      if (delta.attributes?.reference) {
        // If linked doc, render linked doc icon and the doc title.
        const refAttribute = delta.attributes.reference;
        const refMeta = block.store.workspace.meta.docMetas.find(
          doc => doc.id === refAttribute.pageId
        );
        const unavailable = !refMeta;

        const icon = unavailable
          ? LinkedPageIcon({ width: '1.1em', height: '1.1em' })
          : this._docDisplayMetaService.icon(refMeta.id).value;
        const title = unavailable
          ? 'Deleted doc'
          : this._docDisplayMetaService.title(refMeta.id).value;

        return html`<span
          class=${classMap({
            [styles.linkedDocPreviewUnavailable]: unavailable,
            [styles.linkedDocPreviewAvailable]: !unavailable,
          })}
        >
          ${icon}
          <span
            class=${classMap({
              [styles.linkedDocText]: true,
              [styles.linkedDocTextUnavailable]: unavailable,
            })}
            >${title.length ? title : 'Untitled'}</span
          ></span
        >`;
      } else {
        // If not linked doc, render the text.
        return delta.insert.toString().trim().length > 0
          ? html`<span class=${styles.textSpan}
              >${delta.insert.toString()}</span
            >`
          : nothing;
      }
    });

    const headingClass =
      block.props.type in styles.subtypeStyles
        ? styles.subtypeStyles[
            block.props.type as keyof typeof styles.subtypeStyles
          ]
        : '';

    return html`<span
        data-testid="outline-block-preview-${block.props.type}"
        class="${styles.text} ${styles.textGeneral} ${headingClass}"
        >${previewText}</span
      >
      ${this._context.showIcons$.value
        ? html`<span class=${iconClass}
            >${previewIconMap[block.props.type]}</span
          >`
        : nothing}`;
  }

  override render() {
    return html`<div class=${styles.outlineBlockPreview}>
      ${this.renderBlockByFlavour()}
    </div>`;
  }

  renderBlockByFlavour() {
    const { block } = this;
    const iconClass = this.disabledIcon ? styles.iconDisabled : styles.icon;

    if (
      !this._context.enableSorting$.value &&
      !isHeadingBlock(block) &&
      !isRootBlock(block)
    )
      return nothing;

    const showPreviewIcon = this._context.showIcons$.value;

    switch (block.flavour) {
      case 'affine:page':
        assertType<RootBlockModel>(block);
        return block.props.title.length > 0
          ? html`<span
              data-testid="outline-block-preview-title"
              class="${styles.text} ${styles.subtypeStyles.title}"
            >
              ${block.props.title$.value}
            </span>`
          : nothing;
      case 'affine:paragraph':
        assertType<ParagraphBlockModel>(block);
        return this._TextBlockPreview(block);
      case 'affine:list':
        assertType<ListBlockModel>(block);
        return this._TextBlockPreview(block);
      case 'affine:bookmark':
        assertType<BookmarkBlockModel>(block);
        return html`
          <span class="${styles.text} ${styles.textGeneral}"
            >${block.props.title ||
            block.props.url ||
            placeholderMap['bookmark']}</span
          >
          ${showPreviewIcon
            ? html`<span class=${iconClass}
                >${previewIconMap['bookmark']}</span
              >`
            : nothing}
        `;
      case 'affine:code':
        assertType<CodeBlockModel>(block);
        return html`
          <span class="${styles.text} ${styles.textGeneral}"
            >${block.props.language ?? placeholderMap['code']}</span
          >
          ${showPreviewIcon
            ? html`<span class=${iconClass}>${previewIconMap['code']}</span>`
            : nothing}
        `;
      case 'affine:database':
        assertType<DatabaseBlockModel>(block);
        return html`
          <span class="${styles.text} ${styles.textGeneral}"
            >${block.props.title.toString().length
              ? block.props.title.toString()
              : placeholderMap['database']}</span
          >
          ${showPreviewIcon
            ? html`<span class=${iconClass}>${previewIconMap['table']}</span>`
            : nothing}
        `;
      case 'affine:image':
        assertType<ImageBlockModel>(block);
        return html`
          <span class="${styles.text} ${styles.textGeneral}"
            >${block.props.caption?.length
              ? block.props.caption
              : placeholderMap['image']}</span
          >
          ${showPreviewIcon
            ? html`<span class=${iconClass}>${previewIconMap['image']}</span>`
            : nothing}
        `;
      case 'affine:attachment':
        assertType<AttachmentBlockModel>(block);
        return html`
          <span class="${styles.text} ${styles.textGeneral}"
            >${block.props.name?.length
              ? block.props.name
              : placeholderMap['attachment']}</span
          >
          ${showPreviewIcon
            ? html`<span class=${iconClass}
                >${previewIconMap['attachment']}</span
              >`
            : nothing}
        `;
      default:
        return nothing;
    }
  }

  @property({ attribute: false })
  accessor block!: BlockModel;

  @property({ attribute: false })
  accessor disabledIcon = false;

  @consume({ context: tocContext })
  private accessor _context!: TocContext;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_OUTLINE_BLOCK_PREVIEW]: OutlineBlockPreview;
  }
}
