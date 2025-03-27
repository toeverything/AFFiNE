import { latexDeltaMarkdownAdapterMatch } from '@blocksuite/affine-inline-latex';
import { linkDeltaMarkdownAdapterMatch } from '@blocksuite/affine-inline-link';
import { referenceDeltaMarkdownAdapterMatch } from '@blocksuite/affine-inline-reference';
import type { ExtensionType } from '@blocksuite/store';

export const InlineDeltaToPlainTextAdapterExtensions: ExtensionType[] = [
  referenceDeltaMarkdownAdapterMatch,
  linkDeltaMarkdownAdapterMatch,
  latexDeltaMarkdownAdapterMatch,
];
