import type {
  AffineInlineEditor,
  AffineTextAttributes,
} from '@blocksuite/affine-shared/types';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import {
  type AttributeRenderer,
  InlineEditor,
  type InlineMarkdownMatch,
  type InlineRange,
  type InlineRangeProvider,
  type VLine,
} from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
import { effect, signal } from '@preact/signals-core';
import { css, html, type TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import * as Y from 'yjs';
import { z } from 'zod';

import { onVBeforeinput, onVCompositionEnd } from './hooks.js';
import { getPrefixText } from './utils.js';

interface RichTextStackItem {
  meta: Map<'richtext-v-range', InlineRange | null>;
}

export class RichText extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    rich-text {
      display: block;
      height: 100%;
      width: 100%;
      overflow-x: auto;
      overflow-y: hidden;

      scroll-margin-top: 50px;
      scroll-margin-bottom: 30px;
    }

    .inline-editor {
      height: 100%;
      width: 100%;
      outline: none;
      cursor: text;
    }

    .inline-editor.readonly {
      cursor: default;
    }

    rich-text .nowrap-lines v-text span,
    rich-text .nowrap-lines v-element span {
      white-space: pre !important;
    }
  `;

  #verticalScrollContainer: HTMLElement | null = null;

  private readonly _inlineEditor$ = signal<AffineInlineEditor | null>(null);

  private readonly _onCopy = (e: ClipboardEvent) => {
    const inlineEditor = this.inlineEditor;
    if (!inlineEditor) return;

    const inlineRange = inlineEditor.getInlineRange();
    if (!inlineRange) return;

    const text = inlineEditor.yTextString.slice(
      inlineRange.index,
      inlineRange.index + inlineRange.length
    );

    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
    e.stopPropagation();
  };

  private readonly _onCut = (e: ClipboardEvent) => {
    const inlineEditor = this.inlineEditor;
    if (!inlineEditor) return;

    const inlineRange = inlineEditor.getInlineRange();
    if (!inlineRange) return;

    const text = inlineEditor.yTextString.slice(
      inlineRange.index,
      inlineRange.index + inlineRange.length
    );
    inlineEditor.deleteText(inlineRange);
    inlineEditor.setInlineRange({
      index: inlineRange.index,
      length: 0,
    });

    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
    e.stopPropagation();
  };

  private readonly _onPaste = (e: ClipboardEvent) => {
    const inlineEditor = this.inlineEditor;
    if (!inlineEditor) return;

    const inlineRange = inlineEditor.getInlineRange();
    if (!inlineRange) return;

    const text = e.clipboardData
      ?.getData('text/plain')
      ?.replace(/\r?\n|\r/g, '\n');
    if (!text) return;

    inlineEditor.insertText(inlineRange, text);
    inlineEditor.setInlineRange({
      index: inlineRange.index + text.length,
      length: 0,
    });

    e.preventDefault();
    e.stopPropagation();
  };

  private readonly _onStackItemAdded = (event: {
    stackItem: RichTextStackItem;
  }) => {
    const inlineRange = this.inlineEditor?.getInlineRange();
    if (inlineRange) {
      event.stackItem.meta.set('richtext-v-range', inlineRange);
    }
  };

  private readonly _onStackItemPopped = (event: {
    stackItem: RichTextStackItem;
  }) => {
    const inlineRange = event.stackItem.meta.get('richtext-v-range');
    if (inlineRange && this.inlineEditor?.isValidInlineRange(inlineRange)) {
      this.inlineEditor?.setInlineRange(inlineRange);
    }
  };

  private get _yText() {
    return this.yText instanceof Text ? this.yText.yText : this.yText;
  }

  // It will listen ctrl+z/ctrl+shift+z and call undoManager.undo/redo, keydown event will not
  get inlineEditor() {
    return this._inlineEditor$.value;
  }

  get inlineEditorContainer() {
    return this._inlineEditorContainer;
  }

  private _init() {
    if (this.inlineEditor) {
      console.error('Inline editor already exists.');
      return;
    }

    if (!this.enableFormat) {
      this.attributesSchema = z.object({});
    }

    // init inline editor
    this._inlineEditor$.value = new InlineEditor<AffineTextAttributes>(
      this._yText,
      {
        isEmbed: delta => this.embedChecker(delta),
        hooks: {
          beforeinput: onVBeforeinput,
          compositionEnd: onVCompositionEnd,
        },
        inlineRangeProvider: this.inlineRangeProvider,
        vLineRenderer: this.vLineRenderer,
      }
    );
    const inlineEditor = this._inlineEditor$.value;
    if (this.attributesSchema) {
      inlineEditor.setAttributeSchema(this.attributesSchema);
    }
    if (this.attributeRenderer) {
      inlineEditor.setAttributeRenderer(this.attributeRenderer);
    }

    const markdownMatches = this.markdownMatches;
    if (markdownMatches) {
      const markdownTransform = (isEnter: boolean = false) => {
        let inlineRange = inlineEditor.getInlineRange();
        if (!inlineRange) return false;

        let prefixText = getPrefixText(inlineEditor);
        if (isEnter) prefixText = `${prefixText} `;

        for (const match of markdownMatches) {
          const { pattern, action } = match;
          if (prefixText.match(pattern)) {
            if (isEnter) {
              inlineEditor.insertText(
                {
                  index: inlineRange.index,
                  length: 0,
                },
                ' '
              );
              inlineEditor.setInlineRange({
                index: inlineRange.index + 1,
                length: 0,
              });
              inlineRange = inlineEditor.getInlineRange();
              if (!inlineRange) return false;
            }

            action({
              inlineEditor,
              prefixText,
              inlineRange,
              pattern,
              undoManager: this.undoManager,
            });
            return true;
          }
        }
        return false;
      };

      inlineEditor.disposables.add(
        inlineEditor.slots.inputting.subscribe(data => {
          if (!inlineEditor.isComposing && data === ' ') {
            markdownTransform();
          }
        })
      );

      inlineEditor.disposables.add(
        inlineEditor.slots.keydown.subscribe(event => {
          if (event.key === 'Enter' && markdownTransform(true)) {
            event.stopPropagation();
            event.preventDefault();
          }
        })
      );
    }

    // init auto scroll
    inlineEditor.disposables.add(
      effect(() => {
        const inlineRange = inlineEditor.inlineRange$.value;
        if (!inlineRange) return;

        // lazy
        const verticalScrollContainer =
          this.#verticalScrollContainer ||
          (this.#verticalScrollContainer =
            this.verticalScrollContainerGetter?.() || null);

        inlineEditor
          .waitForUpdate()
          .then(() => {
            if (!inlineEditor.mounted || inlineEditor.rendering) return;

            const range = inlineEditor.toDomRange(inlineRange);
            if (!range) return;

            if (verticalScrollContainer) {
              const nativeRange = inlineEditor.getNativeRange();
              if (
                !nativeRange ||
                nativeRange.commonAncestorContainer.parentElement?.contains(
                  inlineEditor.rootElement
                )
              )
                return;

              const containerRect =
                verticalScrollContainer.getBoundingClientRect();
              const rangeRect = range.getBoundingClientRect();

              if (rangeRect.top < containerRect.top) {
                this.scrollIntoView({ block: 'start' });
              } else if (rangeRect.bottom > containerRect.bottom) {
                this.scrollIntoView({ block: 'end' });
              }
            }

            // scroll container is this
            if (this.enableAutoScrollHorizontally) {
              const containerRect = this.getBoundingClientRect();
              const rangeRect = range.getBoundingClientRect();

              let scrollLeft = this.scrollLeft;
              if (
                rangeRect.left + rangeRect.width >
                containerRect.left + containerRect.width
              ) {
                scrollLeft +=
                  rangeRect.left +
                  rangeRect.width -
                  (containerRect.left + containerRect.width) +
                  2;
              }
              this.scrollLeft = scrollLeft;
            }
          })
          .catch(console.error);
      })
    );

    inlineEditor.mount(
      this.inlineEditorContainer,
      this.inlineEventSource,
      this.readonly
    );
  }

  private _unmount() {
    if (this.inlineEditor?.mounted) {
      this.inlineEditor.unmount();
    }
    this._inlineEditor$.value = null;
  }

  override connectedCallback() {
    super.connectedCallback();

    if (!this._yText) {
      console.error('rich-text need yText to init.');
      return;
    }
    if (!this._yText.doc) {
      console.error('yText should be bind to yDoc.');
      return;
    }

    if (!this.undoManager) {
      this.undoManager = new Y.UndoManager(this._yText, {
        trackedOrigins: new Set([this._yText.doc.clientID]),
      });
    }

    if (this.enableUndoRedo) {
      this.disposables.addFromEvent(this, 'keydown', (e: KeyboardEvent) => {
        // eslint-disable-next-line sonarjs/no-collapsible-if
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'z' || e.key === 'Z') {
            if (e.shiftKey) {
              this.undoManager.redo();
            } else {
              this.undoManager.undo();
            }
            e.stopPropagation();
          }
        }
      });

      this.undoManager.on('stack-item-added', this._onStackItemAdded);
      this.undoManager.on('stack-item-popped', this._onStackItemPopped);
      this.disposables.add({
        dispose: () => {
          this.undoManager.off('stack-item-added', this._onStackItemAdded);
          this.undoManager.off('stack-item-popped', this._onStackItemPopped);
        },
      });
    }

    if (this.enableClipboard) {
      this.disposables.addFromEvent(this, 'copy', this._onCopy);
      this.disposables.addFromEvent(this, 'cut', this._onCut);
      this.disposables.addFromEvent(this, 'paste', this._onPaste);
    }

    this.updateComplete
      .then(() => {
        this._unmount();
        this._init();

        this.disposables.add({
          dispose: () => {
            this._unmount();
          },
        });
      })
      .catch(console.error);
  }

  override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    await this.inlineEditor?.waitForUpdate();
    return result;
  }

  // If it is true rich-text will handle undo/redo by itself. (including v-range restore)
  override render() {
    const classes = classMap({
      'inline-editor': true,
      'nowrap-lines': !this.wrapText,
      readonly: this.readonly,
    });

    return html`<div
      contenteditable=${this.readonly ? 'false' : 'true'}
      class=${classes}
    ></div>`;
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    const inlineEditor = this.inlineEditor;
    if (inlineEditor && this._yText && this._yText !== inlineEditor.yText) {
      this._unmount();
      this._init();
      return;
    }
    if (this.inlineEditor && changedProperties.has('readonly')) {
      this.inlineEditor.setReadonly(this.readonly);
    }
  }

  @query('.inline-editor')
  private accessor _inlineEditorContainer!: HTMLDivElement;

  @property({ attribute: false })
  accessor attributeRenderer: AttributeRenderer | undefined = undefined;

  @property({ attribute: false })
  accessor attributesSchema: z.ZodSchema | undefined = undefined;

  @property({ attribute: false })
  accessor embedChecker: <
    TextAttributes extends AffineTextAttributes = AffineTextAttributes,
  >(
    delta: DeltaInsert<TextAttributes>
  ) => boolean = () => false;

  @property({ attribute: false })
  accessor enableAutoScrollHorizontally = true;

  // If it is true rich-text will prevent events related to clipboard bubbling up and handle them by itself.
  @property({ attribute: false })
  accessor enableClipboard = true;

  // `attributesSchema` will be overwritten to `z.object({})` if `enableFormat` is false.
  @property({ attribute: false })
  accessor enableFormat = true;

  // bubble up if pressed ctrl+z/ctrl+shift+z.
  @property({ attribute: false })
  accessor enableUndoRedo = true;

  @property({ attribute: false })
  accessor inlineEventSource: HTMLElement | undefined = undefined;

  @property({ attribute: false })
  accessor inlineRangeProvider: InlineRangeProvider | undefined = undefined;

  @property({ attribute: false })
  accessor markdownMatches: InlineMarkdownMatch<AffineTextAttributes>[] = [];

  @property({ attribute: false })
  accessor readonly = false;

  // rich-text will create a undoManager if it is not provided.
  @property({ attribute: false })
  accessor undoManager!: Y.UndoManager;

  @property({ attribute: false })
  accessor verticalScrollContainerGetter:
    | (() => HTMLElement | null)
    | undefined = undefined;

  @property({ attribute: false })
  accessor vLineRenderer: ((vLine: VLine) => TemplateResult) | undefined;

  @property({ attribute: false })
  accessor wrapText = true;

  @property({ attribute: false })
  accessor yText!: Y.Text | Text;
}
