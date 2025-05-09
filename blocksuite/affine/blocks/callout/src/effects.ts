import { CalloutBlockComponent } from './callout-block';
import { EmojiMenu } from './emoji-menu';

export function effects() {
  customElements.define('affine-callout', CalloutBlockComponent);
  customElements.define('affine-emoji-menu', EmojiMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-callout': CalloutBlockComponent;
    'affine-emoji-menu': EmojiMenu;
  }
}
