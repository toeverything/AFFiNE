import type { Page } from '@blocksuite/store';

declare global {
  interface Window {
    lastImportedMarkdown: string;
  }
}

export async function initPageWithPreloading(page: Page) {
  const workspace = page.workspace;
  const { data } = await import(
    // @ts-expect-error
    '@affine/templates/affine-0.6.0-preloading.json'
  );
  await workspace.importPageSnapshot(data['space:Qmo9-1SGTB'], page.id);
}

export function initEmptyPage(page: Page): void {
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(''),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
}
