import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { StdIdentifier } from '@blocksuite/block-std';
import { InlineSpecExtension } from '@blocksuite/block-std/inline';
import { html } from 'lit';
import { z } from 'zod';

export const LinkInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>('link', provider => {
    const std = provider.get(StdIdentifier);
    return {
      name: 'link',
      schema: z.string().optional().nullable().catch(undefined),
      match: delta => {
        return !!delta.attributes?.link;
      },
      renderer: ({ delta }) => {
        return html`<affine-link .std=${std} .delta=${delta}></affine-link>`;
      },
    };
  });
