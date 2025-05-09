import { affineTextStyles } from '@blocksuite/affine-shared/styles';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { ShadowlessElement } from '@blocksuite/std';
import { ZERO_WIDTH_FOR_EMPTY_LINE } from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { ThemedToken } from 'shiki';

export class AffineCodeUnit extends ShadowlessElement {
  get codeBlock() {
    return this.closest('affine-code');
  }

  get vElement() {
    return this.closest('v-element');
  }

  override render() {
    if (this.delta.attributes?.link && this.codeBlock) {
      return html`<affine-link
        .std=${this.codeBlock.std}
        .delta=${this.delta}
      ></affine-link>`;
    }

    let style = this.delta.attributes
      ? affineTextStyles(this.delta.attributes)
      : {};
    if (this.delta.attributes?.code) {
      style = {
        ...style,
        'font-size': 'calc(var(--affine-font-base) - 3px)',
        padding: '0px 4px 2px',
      };
    }

    const plainContent = html`<span style=${styleMap(style)}
      ><v-text .str=${this.delta.insert}></v-text
    ></span>`;

    const codeBlock = this.codeBlock;
    const vElement = this.vElement;
    if (!codeBlock || !vElement) return plainContent;
    const tokens = codeBlock.highlightTokens$.value;
    if (tokens.length === 0) return plainContent;
    // copy the tokens to avoid modifying the original tokens
    const lineTokens = structuredClone(tokens[vElement.lineIndex]);
    if (lineTokens.length === 0) return plainContent;

    const startOffset = vElement.startOffset;
    const endOffset = vElement.endOffset;
    const includedTokens: ThemedToken[] = [];
    lineTokens.forEach(token => {
      if (
        (token.offset <= startOffset &&
          token.offset + token.content.length >= startOffset) ||
        (token.offset >= startOffset &&
          token.offset + token.content.length <= endOffset) ||
        (token.offset <= endOffset &&
          token.offset + token.content.length >= endOffset)
      ) {
        includedTokens.push(token);
      }
    });
    if (includedTokens.length === 0) return plainContent;

    if (includedTokens.length === 1) {
      const token = includedTokens[0];
      const content = token.content.slice(
        startOffset - token.offset,
        endOffset - token.offset
      );

      return html`<span
        style=${styleMap({
          color: token.color,
          ...style,
        })}
        ><v-text .str=${content}></v-text
      ></span>`;
    } else {
      const firstToken = includedTokens[0];
      const lastToken = includedTokens[includedTokens.length - 1];

      const firstContent = firstToken.content.slice(
        startOffset - firstToken.offset,
        firstToken.content.length
      );
      const lastContent = lastToken.content.slice(
        0,
        endOffset - lastToken.offset
      );
      firstToken.content = firstContent;
      lastToken.content = lastContent;

      const vTexts = includedTokens.map(token => {
        return html`<v-text
          .str=${token.content}
          style=${styleMap({
            color: token.color,
            ...style,
          })}
        ></v-text>`;
      });

      return html`<span>${vTexts}</span>`;
    }
  }

  @property({ type: Object })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-code-unit': AffineCodeUnit;
  }
}
