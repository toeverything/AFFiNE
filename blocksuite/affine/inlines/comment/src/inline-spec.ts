import { type CommentId } from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { dynamicSchema, InlineSpecExtension } from '@blocksuite/std/inline';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit-html';
import { z } from 'zod';

type InlineCommendId = `comment-${CommentId}`;
function isInlineCommendId(key: string): key is InlineCommendId {
  return key.startsWith('comment-');
}

export const CommentInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'comment',
    schema: dynamicSchema(
      isInlineCommendId,
      z.boolean().optional().nullable().catch(undefined)
    ),
    match: delta => {
      if (!delta.attributes) return false;
      const comments = Object.entries(delta.attributes).filter(
        ([key, value]) => isInlineCommendId(key) && value === true
      );
      return comments.length > 0;
    },
    renderer: ({ delta }) => {
      const style = styleMap({
        'background-color': 'red',
      });
      return html`<span style=${style}
        ><affine-text .delta=${delta}></affine-text
      ></span>`;
    },
  });
