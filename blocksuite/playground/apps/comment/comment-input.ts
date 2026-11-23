import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { RichText } from '@blocksuite/affine/rich-text';
import { ShadowlessElement, TextSelection } from '@blocksuite/affine/std';
import { css, html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import * as Y from 'yjs';

import type { Comment, CommentManager } from './comment-manager.js';

export class CommentInput extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .comment-input-container {
      padding: 16px;
    }

    .comment-quote {
      font-size: 10px;
      color: var(--affine-text-secondary-color);
      padding-left: 8px;
      border-left: 2px solid var(--affine-text-secondary-color);
      margin-bottom: 8px;
    }

    .comment-author {
      font-size: 12px;
    }

    .comment-editor {
      white-space: pre-wrap;
      overflow-wrap: break-word;
      min-height: 24px;
      margin-top: 16px;
      margin-bottom: 16px;
    }

    .comment-control {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
  `;

  private readonly _cancel = () => {
    this.remove();
  };

  private readonly _submit = (textSelection: TextSelection) => {
    const deltas = this._editor.inlineEditor?.yTextDeltas;
    if (!deltas) {
      this.remove();
      return;
    }

    const yText = new Y.Text();
    yText.applyDelta(deltas);
    const comment = this.manager.addComment(textSelection, {
      author: 'Anonymous',
      text: yText,
    });

    this.onSubmit?.(comment);

    this.remove();
  };

  get host() {
    return this.manager.host;
  }

  override render() {
    const textSelection = this.host.selection.find(TextSelection);
    if (!textSelection) {
      this.remove();
      return nothing;
    }
    const parseResult = this.manager.parseTextSelection(textSelection);
    if (!parseResult) {
      this.remove();
      return nothing;
    }

    const { quote } = parseResult;

    const tmpYDoc = new Y.Doc();
    const tmpYText = tmpYDoc.getText('comment');

    return html`<div class="comment-input-container">
      <div class="comment-state">
        <div class="comment-quote">${quote}</div>
        <div class="comment-author">Anonymous</div>
      </div>
      <rich-text
        @blur=${() => this._submit(textSelection)}
        .yText=${tmpYText}
        class="comment-editor"
      ></rich-text>
      <div class="comment-control">
        <button
          @click=${() => this._submit(textSelection)}
          class="comment-submit"
        >
          Submit
        </button>
        <button @click=${this._cancel} class="comment-cancel">Cancel</button>
      </div>
    </div>`;
  }

  @query('rich-text')
  private accessor _editor!: RichText;

  @property({ attribute: false })
  accessor manager!: CommentManager;

  @property({ attribute: false })
  accessor onSubmit: undefined | ((comment: Comment) => void) = undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'comment-input': CommentInput;
  }
}
