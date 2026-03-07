import { whenHover } from '@blocksuite/affine-components/hover';
import { Peekable } from '@blocksuite/affine-components/peek';
import type { ReferenceInfo } from '@blocksuite/affine-model';
import {
  DEFAULT_DOC_NAME,
  REFERENCE_NODE,
} from '@blocksuite/affine-shared/consts';
import {
  DocDisplayMetaProvider,
  ToolbarRegistryIdentifier,
} from '@blocksuite/affine-shared/services';
import { affineTextStyles } from '@blocksuite/affine-shared/styles';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import {
  cloneReferenceInfo,
  createDefaultDoc,
  referenceToNode,
} from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { LinkedPageIcon } from '@blocksuite/icons/lit';
import type { BlockComponent, BlockStdScope } from '@blocksuite/std';
import { BLOCK_ID_ATTR, ShadowlessElement } from '@blocksuite/std';
import {
  INLINE_ROOT_ATTR,
  type InlineRootElement,
  ZERO_WIDTH_FOR_EMBED_NODE,
  ZERO_WIDTH_FOR_EMPTY_LINE,
} from '@blocksuite/std/inline';
import type { DeltaInsert, DocMeta, Store } from '@blocksuite/store';
import { css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { ReferenceNodeConfigProvider } from './reference-config';
import { RefNodeSlotsProvider } from './reference-node-slots';
import type { DocLinkClickedEvent } from './types';

@Peekable({ action: false })
export class AffineReference extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .affine-reference {
      white-space: normal;
      word-break: break-word;
      color: var(--affine-text-primary-color);
      fill: var(--affine-icon-color);
      border-radius: 4px;
      text-decoration: none;
      cursor: pointer;
      user-select: none;
      padding: 1px 2px 1px 0;

      svg {
        margin-bottom: 0.1em;
      }
    }
    .affine-reference:hover {
      background: var(--affine-hover-color);
    }

    .affine-reference[data-selected='true'] {
      background: var(--affine-hover-color);
    }

    .affine-reference-title {
      margin-left: 4px;
      border-bottom: 0.5px solid var(--affine-divider-color);
      transition: border 0.2s ease-out;
    }
    .affine-reference-title:hover {
      border-bottom: 0.5px solid var(--affine-icon-color);
    }

    /* Unresolved wikilink: pageId is '' (not yet resolved from title).
     * Dashed underline per contracts/inline-extensions.md §3.
     * Uses text-decoration-style for forced-colors compatibility (not box-shadow).
     * Non-text contrast ≥3:1 (WCAG SC 1.4.11): dashed underline inherits text colour
     * which is already ≥4.5:1. */
    .affine-reference--unresolved .affine-reference-title {
      text-decoration: underline dashed;
      text-decoration-color: var(--affine-text-secondary-color, currentColor);
      border-bottom: none;
    }
    .affine-reference--unresolved {
      color: var(--affine-text-secondary-color, inherit);
    }
  `;

  get docTitle() {
    return this.refMeta?.title ?? DEFAULT_DOC_NAME;
  }

  private readonly _updateRefMeta = (doc: Store) => {
    const refAttribute = this.delta.attributes?.reference;
    if (!refAttribute) {
      return;
    }

    const refMeta = doc.workspace.meta.docMetas.find(
      doc => doc.id === refAttribute.pageId
    );
    this.refMeta = refMeta
      ? {
          ...refMeta,
        }
      : undefined;
  };

  // Since the linked doc may be deleted, the `_refMeta` could be undefined.
  @state()
  accessor refMeta: DocMeta | undefined = undefined;

  get _icon() {
    const { pageId, params, title } = this.referenceInfo;
    return this.std
      .get(DocDisplayMetaProvider)
      .icon(pageId, { params, title, referenced: true }).value;
  }

  get _title() {
    const { pageId, params, title } = this.referenceInfo;
    return (
      this.std
        .get(DocDisplayMetaProvider)
        .title(pageId, { params, title, referenced: true }).value || title
    );
  }

  get block() {
    if (!this.inlineEditor?.rootElement) return null;
    const block = this.inlineEditor.rootElement.closest<BlockComponent>(
      `[${BLOCK_ID_ATTR}]`
    );
    return block;
  }

  get customContent() {
    return this.config.customContent;
  }

  get doc() {
    const doc = this.config.doc;
    return doc;
  }

  get inlineEditor() {
    const inlineRoot = this.closest<InlineRootElement<AffineTextAttributes>>(
      `[${INLINE_ROOT_ATTR}]`
    );
    return inlineRoot?.inlineEditor;
  }

  get referenceInfo(): ReferenceInfo {
    const reference = this.delta.attributes?.reference;
    const id = this.doc?.id ?? '';
    if (!reference) return { pageId: id };
    return cloneReferenceInfo(reference);
  }

  get selfInlineRange() {
    const selfInlineRange = this.inlineEditor?.getInlineRangeFromElement(this);
    return selfInlineRange;
  }

  readonly open = (event?: Partial<DocLinkClickedEvent>) => {
    if (!this.config.interactable) return;
    if (event?.event?.button === 2) {
      return;
    }

    const reference = this.delta.attributes?.reference;

    // Unresolved wikilink (pageId === ''): attempt re-resolution, then create page.
    // Per contracts/inline-extensions.md §3: re-resolve first (race condition guard),
    // only create if still unresolved.
    if (reference?.pageId === '' && reference?.title) {
      this._openOrCreateWikilink(reference.title, event);
      return;
    }

    this.std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
      ...this.referenceInfo,
      ...event,
      openMode:
        event?.event?.button === 1 ? 'open-in-new-tab' : event?.openMode,
      host: this.std.host,
    });
  };

  /**
   * Handles click on an unresolved wikilink.
   * 1. Re-checks workspace for a page matching title (race condition guard).
   * 2. If found: updates delta pageId and opens.
   * 3. If not found: creates new page with title, updates delta pageId, navigates.
   */
  private _openOrCreateWikilink(
    title: string,
    event?: Partial<DocLinkClickedEvent>
  ) {
    const workspace = this.std.store.workspace;
    // Re-resolve: check if a matching doc has been created since this delta was written.
    // Uses workspace.meta.docMetas — the same source as the existing _updateRefMeta pattern.
    const existingMeta = workspace.meta.docMetas.find(
      (meta: DocMeta) => meta.title?.toLowerCase() === title.toLowerCase()
    );

    const resolvedPageId = existingMeta?.id ?? null;

    if (!resolvedPageId) {
      // Create a new page with the wikilink title.
      const newDoc = createDefaultDoc(workspace, { title });
      this._updateWikilinkPageId(newDoc.id);
      this.std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
        pageId: newDoc.id,
        params: this.referenceInfo.params,
        openMode:
          event?.event?.button === 1 ? 'open-in-new-tab' : event?.openMode,
        host: this.std.host,
      });
    } else {
      // Doc found on re-resolve — update delta and open.
      this._updateWikilinkPageId(resolvedPageId);
      this.std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
        pageId: resolvedPageId,
        params: this.referenceInfo.params,
        openMode:
          event?.event?.button === 1 ? 'open-in-new-tab' : event?.openMode,
        host: this.std.host,
      });
    }
  }

  /** Writes the resolved pageId back into the inline delta (CRDT mutation). */
  private _updateWikilinkPageId(pageId: string) {
    const selfRange = this.selfInlineRange;
    if (!selfRange || !this.inlineEditor) return;
    const reference = this.delta.attributes?.reference;
    if (!reference) return;
    this.inlineEditor.formatText(selfRange, {
      reference: { ...reference, pageId },
    });
  }

  _whenHover = whenHover(
    hovered => {
      if (!this.config.interactable) return;

      const message$ = this.std.get(ToolbarRegistryIdentifier).message$;

      if (hovered) {
        message$.value = {
          flavour: 'affine:reference',
          element: this,
          setFloating: this._whenHover.setFloating,
        };
        return;
      }

      // Clears previous bindings
      message$.value = null;
      this._whenHover.setFloating();
    },
    { enterDelay: 500 }
  );

  override connectedCallback() {
    super.connectedCallback();

    this._whenHover.setReference(this);

    const message$ = this.std.get(ToolbarRegistryIdentifier).message$;

    this._disposables.add(() => {
      if (message$?.value) {
        message$.value = null;
      }
      this._whenHover.dispose();
    });

    if (!this.config) {
      console.error('`reference-node` need `ReferenceNodeConfig`.');
      return;
    }

    if (this.delta.insert !== REFERENCE_NODE) {
      console.error(
        `Reference node must be initialized with '${REFERENCE_NODE}', but got '${this.delta.insert}'`
      );
    }

    const doc = this.doc;
    if (doc) {
      this._disposables.add(
        doc.workspace.slots.docListUpdated.subscribe(() =>
          this._updateRefMeta(doc)
        )
      );
    }

    this.updateComplete
      .then(() => {
        if (!this.inlineEditor || !doc) return;

        // observe yText update
        this.disposables.add(
          this.inlineEditor.slots.textChange.subscribe(() =>
            this._updateRefMeta(doc)
          )
        );
      })
      .catch(console.error);
  }

  // reference to block/element
  referenceToNode() {
    return referenceToNode(this.referenceInfo);
  }

  override render() {
    const refMeta = this.refMeta;
    const attributes = this.delta.attributes;
    const reference = attributes?.reference;
    const type = reference?.type;
    if (!attributes || !type) {
      return nothing;
    }

    // pageId === '' means this is an unresolved wikilink (title known, doc not yet resolved).
    // Distinct from isDeleted (doc existed but was deleted).
    const isUnresolved = reference?.pageId === '';
    const isDeleted = !isUnresolved && !refMeta;

    const title = this._title;
    const icon = choose(type, [
      ['LinkedPage', () => this._icon],
      [
        'Subpage',
        () =>
          LinkedPageIcon({
            width: '1.25em',
            height: '1.25em',
            style:
              'user-select:none;flex-shrink:0;vertical-align:middle;font-size:inherit;margin-bottom:0.1em;',
          }),
      ],
    ]);

    const style = affineTextStyles(
      attributes,
      isDeleted
        ? {
            color: 'var(--affine-text-disable-color)',
            textDecoration: 'line-through',
            fill: 'var(--affine-text-disable-color)',
          }
        : {}
    );

    const content = this.customContent
      ? this.customContent(this)
      : html`${icon}<span
            data-title=${ifDefined(title)}
            class="affine-reference-title"
            >${title}</span
          >`;

    // we need to add `<v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text>` in an
    // embed element to make sure inline range calculation is correct
    return html`<span
      data-selected=${this.selected}
      class="affine-reference${isUnresolved
        ? ' affine-reference--unresolved'
        : ''}"
      style=${styleMap(style)}
      @click=${(event: MouseEvent) => this.open({ event })}
      @auxclick=${(event: MouseEvent) => this.open({ event })}
      >${content}<v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text
    ></span>`;
  }

  override willUpdate(_changedProperties: Map<PropertyKey, unknown>) {
    super.willUpdate(_changedProperties);

    const doc = this.doc;
    if (doc) {
      this._updateRefMeta(doc);
    }
  }

  @property({ attribute: false })
  accessor config!: ReferenceNodeConfigProvider;

  @property({ type: Object })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
    attributes: {},
  };

  @property({ type: Boolean })
  accessor selected = false;

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
