import type { AffineInlineEditor } from '@blocksuite/affine-shared/types';
import type { BlockStdScope } from '@blocksuite/block-std';
import type { InlineRange } from '@blocksuite/block-std/inline';

import { LinkPopup } from './link-popup';

export function toggleLinkPopup(
  std: BlockStdScope,
  type: LinkPopup['type'],
  inlineEditor: AffineInlineEditor,
  targetInlineRange: InlineRange,
  abortController: AbortController
): LinkPopup {
  const popup = new LinkPopup();
  popup.std = std;
  popup.type = type;
  popup.inlineEditor = inlineEditor;
  popup.targetInlineRange = targetInlineRange;
  popup.abortController = abortController;

  document.body.append(popup);

  return popup;
}
