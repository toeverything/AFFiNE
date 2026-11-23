import { WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement, TextSelection } from '@blocksuite/affine/std';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { css, html } from 'lit';
import { property, query } from 'lit/decorators.js';

import { CommentInput } from './comment-input.js';
import { CommentManager } from './comment-manager.js';

export class CommentPanel extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    comment-panel {
      position: absolute;
      top: 0;
      right: 0;
      border: 1px solid var(--affine-border-color, #e3e2e4);
      background-color: var(--affine-background-primary-color);
      height: 100vh;
      width: 320px;
      box-sizing: border-box;
      padding-top: 16px;
    }

    .comment-panel-container {
      width: 100%;
      height: 100%;
      padding: 16px;
    }

    .comment-panel-head {
      display: flex;
      gap: 8px;
    }

    .comment-panel-comments {
      margin-top: 16px;
    }

    .comment-panel-comment {
      margin-bottom: 16px;
    }

    .comment-panel-comment-quote {
      font-size: 10px;
      color: var(--affine-text-secondary-color);
      padding-left: 8px;
      border-left: 2px solid var(--affine-text-secondary-color);
      margin-bottom: 8px;
    }

    .comment-panel-comment-author {
      font-size: 12px;
    }

    .comment-panel-comment-text {
      margin-top: 8px;
    }
  `;

  commentManager: CommentManager | null = null;

  private _addComment() {
    const textSelection = this.editor.host?.selection.find(TextSelection);
    if (!textSelection) return;

    const commentInput = new CommentInput();
    if (!this.commentManager) return;

    commentInput.manager = this.commentManager;
    commentInput.onSubmit = () => {
      this.requestUpdate();
    };
    this._container.append(commentInput);
  }

  override connectedCallback() {
    super.connectedCallback();

    if (!this.editor.host) return;
    this.commentManager = new CommentManager(this.editor.host);
  }

  override render() {
    if (!this.commentManager) return;
    const comments = this.commentManager.getComments();

    return html`<div class="comment-panel-container">
      <div class="comment-panel-head">
        <button @click=${this._addComment}>Add Comment</button>
      </div>
      <div class="comment-panel-comments">
        ${comments.map(comment => {
          return html`<div class="comment-panel-comment">
            <div class="comment-panel-comment-quote">${comment.quote}</div>
            <div class="comment-panel-comment-author">${comment.author}</div>
            <div class="comment-panel-comment-text">
              <rich-text .yText=${comment.text} .readonly=${true}></rich-text>
            </div>
          </div>`;
        })}
      </div>
    </div>`;
  }

  @query('.comment-panel-container')
  private accessor _container!: HTMLDivElement;

  @property({ attribute: false })
  accessor editor!: TestAffineEditorContainer;
}

declare global {
  interface HTMLElementTagNameMap {
    'comment-panel': CommentPanel;
  }
}
