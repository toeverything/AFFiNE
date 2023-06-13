import type { Page } from '@blocksuite/store';

export async function initPageWithPreloading(page: Page) {
  const workspace = page.workspace;
  const { data } = await import('@affine/templates/preloading.json');
  await workspace.importPageSnapshot(data['space:hello-world'], page.id);
}

export function initEmptyPage(page: Page): void {
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(''),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
}
