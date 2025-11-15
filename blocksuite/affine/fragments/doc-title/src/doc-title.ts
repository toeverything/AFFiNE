import {
  CodeBlockModel,
  ListBlockModel,
  NoteBlockModel,
  NoteDisplayMode,
  ParagraphBlockModel,
  type RootBlockModel,
} from '@blocksuite/affine-model';
import { focusTextModel, type RichText } from '@blocksuite/affine-rich-text';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Store } from '@blocksuite/store';
import { effect } from '@preact/signals-core';
import { css, html } from 'lit';
import { property, query, state } from 'lit/decorators.js';

const DOC_BLOCK_CHILD_PADDING = 24;

export class DocTitle extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .doc-title-container {
      font-size: 40px;
      line-height: 50px;
      font-weight: 700;
    }
    .doc-icon-container,
    .doc-title-container {
      box-sizing: border-box;
      font-family: var(--affine-font-family);
      color: var(--affine-text-primary-color);
      outline: none;
      resize: none;
      border: 0;
      width: 100%;
      max-width: var(--affine-editor-width);
      margin-left: auto;
      margin-right: auto;
      padding: 38px 0;

      padding-left: var(
        --affine-editor-side-padding,
        ${DOC_BLOCK_CHILD_PADDING}px
      );
      padding-right: var(
        --affine-editor-side-padding,
        ${DOC_BLOCK_CHILD_PADDING}px
      );
    }
    .doc-icon-container + * .doc-title-container {
      /* when doc icon exists, remove the top padding */
      padding-top: 0;
    }

    /* Extra small devices (phones, 640px and down) */
    @container viewport (width <= 640px) {
      .doc-icon-container,
      .doc-title-container {
        padding-left: ${DOC_BLOCK_CHILD_PADDING}px;
        padding-right: ${DOC_BLOCK_CHILD_PADDING}px;
      }
    }

    .doc-title-container-empty::before {
      content: 'Title';
      color: var(--affine-placeholder-color);
      position: absolute;
      opacity: 0.5;
      pointer-events: none;
    }

    .doc-title-container:disabled {
      background-color: transparent;
    }
  `;

  private _getOrCreateFirstPageVisibleNote() {
    const note = this._rootModel?.children.find(
      (child): child is NoteBlockModel =>
        matchModels(child, [NoteBlockModel]) &&
        child.props.displayMode !== NoteDisplayMode.EdgelessOnly
    );
    if (note) return note;

    const noteId = this.doc.addBlock('affine:note', {}, this._rootModel, 0);
    return this.doc.getBlock(noteId)?.model as NoteBlockModel;
  }

  private readonly _onTitleKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || this.doc.readonly) return;
    if (!this._std) return;

    if (event.key === 'Enter') {
      this._std.event.active = true;
      event.preventDefault();
      event.stopPropagation();

      const inlineRange = this.inlineEditor?.getInlineRange();
      if (inlineRange) {
        const rightText = this._rootModel?.props.title.split(inlineRange.index);
        const newFirstParagraphId = this.doc.addBlock(
          'affine:paragraph',
          { text: rightText },
          this._getOrCreateFirstPageVisibleNote(),
          0
        );
        if (this._std) focusTextModel(this._std, newFirstParagraphId);
      }
    } else if (event.key === 'ArrowDown') {
      this._std.event.active = true;
      event.preventDefault();
      event.stopPropagation();

      const note = this._getOrCreateFirstPageVisibleNote();
      const firstText = note?.children.find(block =>
        matchModels(block, [
          ParagraphBlockModel,
          ListBlockModel,
          CodeBlockModel,
        ])
      );
      if (firstText) {
        if (this._std) focusTextModel(this._std, firstText.id);
      } else {
        const newFirstParagraphId = this.doc.addBlock(
          'affine:paragraph',
          {},
          note,
          0
        );
        if (this._std) focusTextModel(this._std, newFirstParagraphId);
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private readonly _updateTitleInMeta = () => {
    if (!this._rootModel) return;
    this.doc.workspace.meta.setDocMeta(this.doc.id, {
      title: this._rootModel.props.title.toString(),
    });
  };

  private get _std() {
    return this._viewport?.querySelector('editor-host')?.std;
  }

  private get _rootModel() {
    return this.doc.root as RootBlockModel | null;
  }

  private get _viewport() {
    return (
      this.closest<HTMLElement>('.affine-page-viewport') ??
      this.closest<HTMLElement>('.affine-edgeless-viewport')
    );
  }

  get inlineEditor() {
    return this._richTextElement.inlineEditor;
  }

  get inlineEditorContainer() {
    return this._richTextElement.inlineEditorContainer;
  }

  override connectedCallback() {
    super.connectedCallback();

    this._isReadonly = this.doc.readonly;
    this._disposables.add(
      effect(() => {
        if (this._isReadonly !== this.doc.readonly) {
          this._isReadonly = this.doc.readonly;
          this.requestUpdate();
        }
      })
    );

    this._disposables.addFromEvent(this, 'keydown', this._onTitleKeyDown);

    // Workaround for inline editor skips composition event
    this._disposables.addFromEvent(
      this,
      'compositionstart',
      () => (this._isComposing = true)
    );

    this._disposables.addFromEvent(
      this,
      'compositionend',
      () => (this._isComposing = false)
    );

    const updateMetaTitle = () => {
      this._updateTitleInMeta();
      this.requestUpdate();
    };

    if (this._rootModel) {
      const rootModel = this._rootModel;
      rootModel.props.title.yText.observe(updateMetaTitle);
      this._disposables.add(() => {
        rootModel.props.title.yText.unobserve(updateMetaTitle);
      });
    }
  }

  override render() {
    const isEmpty = !this._rootModel?.props.title.length && !this._isComposing;

    return html`
      <div
        class="doc-title-container ${isEmpty
          ? 'doc-title-container-empty'
          : ''}"
        data-block-is-title="true"
      >
        <rich-text
          .yText=${this._rootModel?.props.title.yText}
          .undoManager=${this.doc.history.undoManager}
          .verticalScrollContainerGetter=${() => this._viewport}
          .readonly=${this.doc.readonly}
          .enableFormat=${false}
          .wrapText=${this.wrapText}
        ></rich-text>
      </div>
    `;
  }

  @state()
  private accessor _isComposing = false;

  @state()
  private accessor _isReadonly = false;

  @query('rich-text')
  private accessor _richTextElement!: RichText;

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor wrapText = true;
}
