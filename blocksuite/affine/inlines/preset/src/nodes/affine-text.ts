import { affineTextStyles } from '@blocksuite/affine-shared/styles';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { ShadowlessElement } from '@blocksuite/std';
import { ZERO_WIDTH_FOR_EMPTY_LINE } from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

export class AffineText extends ShadowlessElement {
  override render() {
    const style = this.delta.attributes
      ? affineTextStyles(this.delta.attributes)
      : {};

    // Obsidian %% comment %% — invisible in live preview (FR-036 / FR-051)
    if (this.delta.attributes?.obsidianComment) {
      return html`<span
        aria-hidden="true"
        style=${styleMap({ display: 'none' })}
        ><v-text .str=${this.delta.insert}></v-text
      ></span>`;
    }

    // we need to avoid \n appearing before and after the span element, which will
    // cause the unexpected space
    if (this.delta.attributes?.code) {
      return html`<code style=${styleMap(style)}
        ><v-text .str=${this.delta.insert}></v-text
      ></code>`;
    }

    // we need to avoid \n appearing before and after the span element, which will
    // cause the unexpected space
    return html`<span style=${styleMap(style)}
      ><v-text .str=${this.delta.insert}></v-text
    ></span>`;
  }

  @property({ type: Object })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
  };
}
