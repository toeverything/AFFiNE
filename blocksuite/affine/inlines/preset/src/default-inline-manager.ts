import { CommentInlineSpecExtension } from '@blocksuite/affine-inline-comment';
import { FootNoteInlineSpecExtension } from '@blocksuite/affine-inline-footnote';
import { LatexInlineSpecExtension } from '@blocksuite/affine-inline-latex';
import { LinkInlineSpecExtension } from '@blocksuite/affine-inline-link';
import { MentionInlineSpecExtension } from '@blocksuite/affine-inline-mention';
import { ReferenceInlineSpecExtension } from '@blocksuite/affine-inline-reference';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { InlineManagerExtension } from '@blocksuite/std/inline';

import {
  BackgroundInlineSpecExtension,
  BoldInlineSpecExtension,
  CodeInlineSpecExtension,
  ColorInlineSpecExtension,
  ItalicInlineSpecExtension,
  StrikeInlineSpecExtension,
  UnderlineInlineSpecExtension,
} from './inline-spec';

export const DefaultInlineManagerExtension =
  InlineManagerExtension<AffineTextAttributes>({
    id: 'DefaultInlineManager',
    specs: [
      BoldInlineSpecExtension.identifier,
      ItalicInlineSpecExtension.identifier,
      UnderlineInlineSpecExtension.identifier,
      StrikeInlineSpecExtension.identifier,
      CodeInlineSpecExtension.identifier,
      BackgroundInlineSpecExtension.identifier,
      ColorInlineSpecExtension.identifier,
      LatexInlineSpecExtension.identifier,
      ReferenceInlineSpecExtension.identifier,
      LinkInlineSpecExtension.identifier,
      FootNoteInlineSpecExtension.identifier,
      MentionInlineSpecExtension.identifier,
      CommentInlineSpecExtension.identifier,
    ],
  });
