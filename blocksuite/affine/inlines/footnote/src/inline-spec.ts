import { FootNoteSchema } from '@blocksuite/affine-model';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { StdIdentifier } from '@blocksuite/std';
import { InlineSpecExtension } from '@blocksuite/std/inline';
import { html } from 'lit';
import z from 'zod';

import { FootNoteNodeConfigIdentifier } from './footnote-node/footnote-config';

export const FootNoteInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>('footnote', provider => {
    const std = provider.get(StdIdentifier);
    const config =
      provider.getOptional(FootNoteNodeConfigIdentifier) ?? undefined;
    return {
      name: 'footnote',
      schema: z.object({
        footnote: FootNoteSchema.optional().nullable().catch(undefined),
      }),
      match: delta => {
        return !!delta.attributes?.footnote;
      },
      renderer: ({ delta }) => {
        return html`<affine-footnote-node
          .delta=${delta}
          .std=${std}
          .config=${config}
        ></affine-footnote-node>`;
      },
      embed: true,
    };
  });
