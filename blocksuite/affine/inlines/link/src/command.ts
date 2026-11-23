import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { Command } from '@blocksuite/std';
import {
  INLINE_ROOT_ATTR,
  type InlineRootElement,
} from '@blocksuite/std/inline';

import { toggleLinkPopup } from './link-node/link-popup/toggle-link-popup';

export const toggleLink: Command = (ctx, next) => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return false;
  const inlineRoot = range.startContainer.parentElement?.closest<
    InlineRootElement<AffineTextAttributes>
  >(`[${INLINE_ROOT_ATTR}]`);
  if (!inlineRoot) return false;

  const inlineEditor = inlineRoot.inlineEditor;
  const targetInlineRange = inlineEditor.getInlineRange();

  if (!targetInlineRange || targetInlineRange.length === 0) return false;

  const format = inlineEditor.getFormat(targetInlineRange);
  if (format.link) {
    inlineEditor.formatText(targetInlineRange, { link: null });
    return next();
  }

  const abortController = new AbortController();
  const popup = toggleLinkPopup(
    ctx.std,
    'create',
    inlineEditor,
    targetInlineRange,
    abortController
  );
  abortController.signal.addEventListener('abort', () => popup.remove());
  return next();
};
