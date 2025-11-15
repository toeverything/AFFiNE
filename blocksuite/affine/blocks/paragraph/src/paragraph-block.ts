import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import { TOGGLE_BUTTON_PARENT_CLASS } from '@blocksuite/affine-components/toggle-button';
import { DefaultInlineManagerExtension } from '@blocksuite/affine-inline-preset';
import type { ParagraphBlockModel } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import {
  BLOCK_CHILDREN_CONTAINER_PADDING_LEFT,
  EDGELESS_TOP_CONTENTEDITABLE_SELECTOR,
} from '@blocksuite/affine-shared/consts';
import {
  BlockElementCommentManager,
  CitationProvider,
  DocModeProvider,
} from '@blocksuite/affine-shared/services';
import {
  calculateCollapsedSiblings,
  getNearestHeadingBefore,
  getViewportElement,
} from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/std';
import { TextSelection } from '@blocksuite/std';
import {
  getInlineRangeProvider,
  type InlineRangeProvider,
} from '@blocksuite/std/inline';
import { computed, effect, signal } from '@preact/signals-core';
import { html, nothing, type TemplateResult } from 'lit';
import { query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import { ParagraphBlockConfigExtension } from './paragraph-block-config.js';
import { paragraphBlockStyles } from './styles.js';

export class ParagraphBlockComponent extends CaptionedBlockComponent<ParagraphBlockModel> {
  static override styles = paragraphBlockStyles;

  focused$ = computed(() => {
    const selection = this.std.selection.value.find(
      selection => selection.blockId === this.model?.id
    );
    if (!selection) return false;
    return selection.is(TextSelection);
  });

  private readonly _composing = signal(false);

  private readonly _displayPlaceholder = signal(false);

  private _inlineRangeProvider: InlineRangeProvider | null = null;

  private readonly _isInDatabase = () => {
    let parent = this.parentElement;
    while (parent && parent !== document.body) {
      if (parent.tagName.toLowerCase() === 'affine-database') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  };

  private get _placeholder() {
    return this.std
      .get(ParagraphBlockConfigExtension.identifier)
      ?.getPlaceholder(this.model);
  }

  get citationService() {
    return this.std.get(CitationProvider);
  }

  get attributeRenderer() {
    return this.inlineManager.getRenderer();
  }

  get attributesSchema() {
    return this.inlineManager.getSchema();
  }

  get collapsedSiblings() {
    return calculateCollapsedSiblings(this.model);
  }

  get embedChecker() {
    return this.inlineManager.embedChecker;
  }

  get inEdgelessText() {
    return (
      this.topContenteditableElement?.tagName.toLowerCase() ===
      'affine-edgeless-text'
    );
  }

  get inlineEditor() {
    return this._richTextElement?.inlineEditor;
  }

  get inlineManager() {
    return this.std.get(DefaultInlineManagerExtension.identifier);
  }

  get hasCitationSiblings() {
    return this.collapsedSiblings.some(sibling =>
      this.citationService.isCitationModel(sibling)
    );
  }

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockElementCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  override get topContenteditableElement() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') {
      return this.closest<BlockComponent>(
        EDGELESS_TOP_CONTENTEDITABLE_SELECTOR
      );
    }
    return this.rootComponent;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.handleEvent(
      'compositionStart',
      () => {
        this._composing.value = true;
      },
      { flavour: true }
    );
    this.handleEvent(
      'compositionEnd',
      () => {
        this._composing.value = false;
      },
      { flavour: true }
    );

    this._inlineRangeProvider = getInlineRangeProvider(this);

    this.disposables.add(
      effect(() => {
        const composing = this._composing.value;
        if (composing || this.store.readonly) {
          this._displayPlaceholder.value = false;
          return;
        }
        const textSelection = this.host.selection.find(TextSelection);
        const isCollapsed = textSelection?.isCollapsed() ?? false;
        if (!this.focused$.value || !isCollapsed) {
          this._displayPlaceholder.value = false;
          return;
        }

        this.updateComplete
          .then(() => {
            if (
              (this.inlineEditor?.yTextLength ?? 0) > 0 ||
              this._isInDatabase()
            ) {
              this._displayPlaceholder.value = false;
              return;
            }
            this._displayPlaceholder.value = true;
            return;
          })
          .catch(console.error);
      })
    );

    this.disposables.add(
      effect(() => {
        const type = this.model.props.type$.value;
        if (!type.startsWith('h') && this.model.props.collapsed) {
          this.model.props.collapsed = false;
        }
      })
    );

    this.disposables.add(
      effect(() => {
        const collapsed = this.model.props.collapsed$.value;
        this._readonlyCollapsed = collapsed;

        // reset text selection when selected block is collapsed
        if (this.model.props.type$.value.startsWith('h') && collapsed) {
          const collapsedSiblings = this.collapsedSiblings;
          const textSelection = this.host.selection.find(TextSelection);

          if (
            textSelection &&
            collapsedSiblings.some(
              sibling => sibling.id === textSelection.blockId
            )
          ) {
            this.host.selection.clear(['text']);
          }
        }
      })
    );

    // > # 123
    // # 456
    //
    // we need to update collapsed state of 123 when 456 converted to text
    let beforeType = this.model.props.type$.peek();
    this.disposables.add(
      effect(() => {
        const type = this.model.props.type$.value;
        if (beforeType !== type && !type.startsWith('h')) {
          const nearestHeading = getNearestHeadingBefore(this.model);
          if (
            nearestHeading &&
            nearestHeading.props.type.startsWith('h') &&
            nearestHeading.props.collapsed &&
            !this.store.readonly
          ) {
            nearestHeading.props.collapsed = false;
          }
        }
        beforeType = type;
      })
    );
  }

  override async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    await this._richTextElement?.updateComplete;
    return result;
  }

  override renderBlock(): TemplateResult<1> {
    const widgets = html`${repeat(
      Object.entries(this.widgets),
      ([id]) => id,
      ([_, widget]) => widget
    )}`;

    const { type$ } = this.model.props;
    const collapsed = this.store.readonly
      ? this._readonlyCollapsed
      : this.model.props.collapsed;
    const collapsedSiblings = this.collapsedSiblings;

    let style = html``;
    if (this.model.props.type$.value.startsWith('h') && collapsed) {
      style = html`
        <style>
          ${collapsedSiblings.map(sibling =>
            unsafeHTML(`
              [data-block-id="${sibling.id}"] {
                display: none !important;
              }
            `)
          )}
        </style>
      `;
    }

    const textAlignStyle = styleMap({
      textAlign: this.model.props.textAlign$?.value,
    });

    const children = html`<div
      class="affine-block-children-container"
      style=${styleMap({
        paddingLeft: `${BLOCK_CHILDREN_CONTAINER_PADDING_LEFT}px`,
        display: collapsed ? 'none' : undefined,
      })}
    >
      ${this.renderChildren(this.model)}
    </div>`;

    return html`
      ${style}
      <style>
        .affine-paragraph-block-container[data-has-collapsed-siblings='false']
          affine-paragraph-heading-icon
          .heading-icon {
          transform: translateX(-48px);
        }
      </style>
      <div
        class=${classMap({
          'affine-paragraph-block-container': true,
          'highlight-comment': this.isCommentHighlighted,
        })}
        style="${textAlignStyle}"
        data-has-collapsed-siblings="${collapsedSiblings.length > 0}"
      >
        <div
          class=${classMap({
            'affine-paragraph-rich-text-wrapper': true,
            [type$.value]: true,
            [TOGGLE_BUTTON_PARENT_CLASS]: true,
          })}
        >
          ${this.model.props.type$.value.startsWith('h')
            ? html`
                <affine-paragraph-heading-icon
                  .model=${this.model}
                ></affine-paragraph-heading-icon>
              `
            : nothing}
          ${this.model.props.type$.value.startsWith('h') &&
          collapsedSiblings.length > 0
            ? html`
                <blocksuite-toggle-button
                  .collapsed=${collapsed}
                  .updateCollapsed=${(value: boolean) => {
                    if (this.store.readonly) {
                      this._readonlyCollapsed = value;
                    } else {
                      this.store.captureSync();
                      this.store.updateBlock(this.model, {
                        collapsed: value,
                      });
                    }

                    if (this.hasCitationSiblings) {
                      this.citationService.trackEvent('Expand', {
                        control: 'Source Button',
                        type: value ? 'Hide' : 'Show',
                      });
                    }
                  }}
                ></blocksuite-toggle-button>
              `
            : nothing}
          <rich-text
            .yText=${this.model.props.text.yText}
            .inlineEventSource=${this.topContenteditableElement ?? nothing}
            .undoManager=${this.store.history.undoManager}
            .attributesSchema=${this.attributesSchema}
            .attributeRenderer=${this.attributeRenderer}
            .markdownMatches=${this.inlineManager?.markdownMatches}
            .embedChecker=${this.embedChecker}
            .readonly=${this.store.readonly}
            .inlineRangeProvider=${this._inlineRangeProvider}
            .enableClipboard=${false}
            .enableUndoRedo=${false}
            .verticalScrollContainerGetter=${() =>
              getViewportElement(this.host)}
          ></rich-text>
          ${this.inEdgelessText
            ? nothing
            : html`
                <div
                  contenteditable="false"
                  class=${classMap({
                    'affine-paragraph-placeholder': true,
                    visible: this._displayPlaceholder.value,
                  })}
                >
                  ${this._placeholder}
                </div>
              `}
        </div>

        ${children} ${widgets}
      </div>
    `;
  }

  @state()
  private accessor _readonlyCollapsed = false;

  @query('rich-text')
  private accessor _richTextElement: RichText | null = null;

  override accessor blockContainerStyles = {
    margin: 'var(--affine-paragraph-margin, 10px 0)',
  };
}
