import preloadingData from '@affine/templates/affine-0.6.0-preloading.json';
import type { Page } from '@blocksuite/store';

declare global {
  interface Window {
    lastImportedMarkdown: string;
  }
}

export function initPageWithPreloading(page: Page): void {
  logger.debug('initPageWithPreloading', page.id);
  const workspace = page.workspace;
  workspace.importPageSnapshot(
    preloadingData.data['space:Qmo9-1SGTB'],
    page.id
  );
}

export function initEmptyPage(page: Page): void {
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(''),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
}
