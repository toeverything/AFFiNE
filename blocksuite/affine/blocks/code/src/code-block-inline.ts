import { CommentInlineSpecExtension } from '@blocksuite/affine-inline-comment';
import { LatexInlineSpecExtension } from '@blocksuite/affine-inline-latex';
import { LinkInlineSpecExtension } from '@blocksuite/affine-inline-link';
import {
  BackgroundInlineSpecExtension,
  BoldInlineSpecExtension,
  CodeInlineSpecExtension,
  ColorInlineSpecExtension,
  ItalicInlineSpecExtension,
  StrikeInlineSpecExtension,
  UnderlineInlineSpecExtension,
} from '@blocksuite/affine-inline-preset';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import {
  InlineManagerExtension,
  InlineSpecExtension,
} from '@blocksuite/std/inline';
import { html } from 'lit';
import { z } from 'zod';

export const CodeBlockUnitSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'code-block-unit',
    schema: z.object({
      'code-block-uint': z.undefined(),
    }),
    match: () => true,
    renderer: ({ delta }) => {
      return html`<affine-code-unit .delta=${delta}></affine-code-unit>`;
    },
  });

export const CodeBlockInlineManagerExtension =
  InlineManagerExtension<AffineTextAttributes>({
    id: 'CodeBlockInlineManager',
    enableMarkdown: false,
    specs: [
      BoldInlineSpecExtension.identifier,
      ItalicInlineSpecExtension.identifier,
      UnderlineInlineSpecExtension.identifier,
      StrikeInlineSpecExtension.identifier,
      CodeInlineSpecExtension.identifier,
      BackgroundInlineSpecExtension.identifier,
      ColorInlineSpecExtension.identifier,
      LatexInlineSpecExtension.identifier,
      LinkInlineSpecExtension.identifier,
      CodeBlockUnitSpecExtension.identifier,
      CommentInlineSpecExtension.identifier,
    ],
  });
