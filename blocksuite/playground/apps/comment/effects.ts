import { CommentInput } from './comment-input.js';
import { CommentPanel } from './comment-panel.js';

export function effects() {
  customElements.define('comment-input', CommentInput);
  customElements.define('comment-panel', CommentPanel);
}
