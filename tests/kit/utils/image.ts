import type { Page } from '@playwright/test';

import { focusInlineEditor } from './page-logic';

export async function importImage(page: Page, url: string) {
  await focusInlineEditor(page);
  await page.evaluate(
    ([url]) => {
      const clipData = {
        'text/html': `<img alt={'Sample image'} src=${url} />`,
      };
      const e = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      Object.defineProperty(e, 'target', {
        writable: false,
        value: document,
      });
      Object.entries(clipData).forEach(([key, value]) => {
        e.clipboardData?.setData(key, value);
      });
      document.dispatchEvent(e);
    },
    [url]
  );
  // TODO(@catsjuice): wait for image to be loaded more reliably
  await page.waitForTimeout(1000);
}
