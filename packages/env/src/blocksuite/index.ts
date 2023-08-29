import type { Page } from '@blocksuite/store';

/**
 * @deprecated
 */
export async function initEmptyPage(page: Page, title?: string) {
  await page.waitForLoaded();
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(title || ''),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, noteBlockId);
}
