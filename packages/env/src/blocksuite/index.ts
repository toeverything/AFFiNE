import type { Page } from '@blocksuite/store';

export async function initPageWithPreloading(page: Page) {
  const workspace = page.workspace;
  const { data } = await import('@affine/templates/preloading.json');
  await page.waitForLoaded();
  await workspace.importPageSnapshot(data['space:hello-world'], page.id);
}

export async function initEmptyPage(page: Page) {
  await page.waitForLoaded();
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(''),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, noteBlockId);
}

export * from './subdoc-migration';
