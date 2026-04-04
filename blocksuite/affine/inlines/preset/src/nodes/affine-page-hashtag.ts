import { affineTextStyles } from '@blocksuite/affine-shared/styles';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { ShadowlessElement } from '@blocksuite/std';
import { ZERO_WIDTH_FOR_EMPTY_LINE } from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

const HASHTAG_BADGE_STYLE = {
  'background-color': '#ffecf6',
  border: '1px solid var(--affine-border-color)',
  'border-radius': '6px',
  display: 'inline-block',
  padding: '1px 6px',
  'line-height': 'normal',
} as const;

export class AffinePageHashtag extends ShadowlessElement {
  static override styles = css`
    affine-page-hashtag .affine-page-hashtag-content [data-v-text='true'] {
      display: inline-block;
    }

    affine-page-hashtag .affine-page-hashtag-prefix {
      display: inline-block;
      font-size: 0;
      line-height: 0;
      overflow: hidden;
      width: 0;
    }
  `;

  override render() {
    const style = this.delta.attributes
      ? affineTextStyles(this.delta.attributes, HASHTAG_BADGE_STYLE)
      : HASHTAG_BADGE_STYLE;
    const prefix = this.delta.insert.at(0) ?? '';
    const content = this.delta.insert.slice(1);

    return html`<span class="affine-page-hashtag-badge" style=${styleMap(style)}
      ><span class="affine-page-hashtag-prefix"
        ><v-text .str=${prefix}></v-text></span
      ><span class="affine-page-hashtag-content"
        ><v-text .str=${content}></v-text></span
    ></span>`;
  }

  @property({ type: Object })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
  };
}
