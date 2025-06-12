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

  get vLine() {
    return this.closest('v-line');
  }

  get vElement() {
    return this.closest('v-element');
  }

  override render() {
    const codeBlock = this.codeBlock;

    if (this.delta.attributes?.link && codeBlock) {
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

    const vElement = this.vElement;
    const vLine = this.vLine;
    const tokenizer = codeBlock?.tokenizer$.value;

    if (!codeBlock || !tokenizer || !vElement || !vLine) {
      return plainContent;
    }

    const lineTokens = structuredClone(tokenizer.getLineTokens(this.lineIndex));

    const lineStartOffset = vLine.startOffset;

    if (lineTokens.length === 0) return plainContent;

    const startOffset = vElement.startOffset;
    const endOffset = vElement.endOffset;

    const includedTokens: ThemedToken[] = [];
    lineTokens.forEach(token => {
      const tokenOffset = token.offset + lineStartOffset;
      if (
        (tokenOffset <= startOffset &&
          tokenOffset + token.content.length >= startOffset) ||
        (tokenOffset >= startOffset &&
          tokenOffset + token.content.length <= endOffset) ||
        (tokenOffset <= endOffset &&
          tokenOffset + token.content.length >= endOffset)
      ) {
        includedTokens.push(token);
      }
    });

    if (includedTokens.length === 0) return plainContent;

    if (includedTokens.length === 1) {
      const token = includedTokens[0];
      const tokenOffset = token.offset + lineStartOffset;

      const content = token.content.slice(
        startOffset - tokenOffset,
        endOffset - tokenOffset
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
      const firstTokenOffset = firstToken.offset + lineStartOffset;
      const lastTokenOffset = lastToken.offset + lineStartOffset;

      const firstContent = firstToken.content.slice(
        startOffset - firstTokenOffset,
        firstToken.content.length
      );
      const lastContent = lastToken.content.slice(
        0,
        endOffset - lastTokenOffset
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

  @property({ type: Number })
  accessor lineIndex!: number;

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
