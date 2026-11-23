import { type Clipboard as BlockStdScopeClipboard } from '@blocksuite/affine/std';

import { fakeCopyAction } from './fake';

const clipboardWriteIsSupported =
  'clipboard' in navigator && 'write' in navigator.clipboard;

const clipboardWriteTextIsSupported =
  'clipboard' in navigator && 'writeText' in navigator.clipboard;

export const copyTextToClipboard = async (text: string) => {
  // 1. try using Async API first, works on HTTPS domain
  if (clipboardWriteTextIsSupported) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error(err);
    }
  }

  // 2. try using `document.execCommand`
  // https://github.com/zenorocha/clipboard.js/blob/master/src/actions/copy.js
  return fakeCopyAction(text);
};

export const copyLinkToBlockStdScopeClipboard = async (
  text: string,
  clipboard?: BlockStdScopeClipboard
) => {
  let success = false;

  if (!clipboard) return success;

  if (clipboardWriteIsSupported) {
    try {
      await clipboard.writeToClipboard(items => ({
        ...items,
        'text/plain': text,
        // wrap a link
        'text/html': `<a href="${text}">${text}</a>`,
      }));
      success = true;
    } catch (error) {
      console.error(error);
    }
  }

  if (!success) {
    success = await copyTextToClipboard(text);
  }

  return success;
};
