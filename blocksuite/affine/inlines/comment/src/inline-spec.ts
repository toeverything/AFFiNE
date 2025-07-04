import { type CommentId } from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { dynamicSchema, InlineSpecExtension } from '@blocksuite/std/inline';
import { html, nothing } from 'lit-html';
import { when } from 'lit-html/directives/when.js';
import { z } from 'zod';

import { extractCommentIdFromDelta } from './utils';

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
    renderer: ({ delta, children }) =>
      html`<inline-comment .commentIds=${extractCommentIdFromDelta(delta)}
        >${when(
          children,
          () => html`${children}`,
          () => nothing
        )}</inline-comment
      >`,
    wrapper: true,
  });
