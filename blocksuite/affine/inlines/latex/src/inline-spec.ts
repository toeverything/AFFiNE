import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { StdIdentifier } from '@blocksuite/std';
import { InlineSpecExtension } from '@blocksuite/std/inline';
import { html } from 'lit';
import { z } from 'zod';

export const LatexInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>('latex', provider => {
    const std = provider.get(StdIdentifier);
    return {
      name: 'latex',
      schema: z.object({
        latex: z.string().optional().nullable().catch(undefined),
      }),
      match: delta => typeof delta.attributes?.latex === 'string',
      renderer: ({ delta, selected, editor, startOffset, endOffset }) => {
        return html`<affine-latex-node
          .std=${std}
          .delta=${delta}
          .selected=${selected}
          .editor=${editor}
          .startOffset=${startOffset}
          .endOffset=${endOffset}
        ></affine-latex-node>`;
      },
      embed: true,
    };
  });

export const LatexEditorUnitSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'latex-editor-unit',
    schema: z.object({
      'latex-editor-unit': z.undefined(),
    }),
    match: () => true,
    renderer: ({ delta }) => {
      return html`<latex-editor-unit .delta=${delta}></latex-editor-unit>`;
    },
  });
