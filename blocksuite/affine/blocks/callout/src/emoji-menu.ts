import { WithDisposable } from '@blocksuite/global/lit';
import data from '@emoji-mart/data';
import { Picker } from 'emoji-mart';
import { html, LitElement, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';

export class EmojiMenu extends WithDisposable(LitElement) {
  override firstUpdated(props: PropertyValues) {
    const result = super.firstUpdated(props);

    const picker = new Picker({
      data,
      onEmojiSelect: this.onEmojiSelect,
      autoFocus: true,
      theme: this.theme,
    });
    this.emojiMenu.append(picker as unknown as Node);

    return result;
  }

  @property({ attribute: false })
  accessor onEmojiSelect: (data: any) => void = () => {};

  @property({ attribute: false })
  accessor theme: 'light' | 'dark' = 'light';

  @query('.affine-emoji-menu')
  accessor emojiMenu!: HTMLElement;

  override render() {
    return html`<div class="affine-emoji-menu"></div>`;
  }
}
