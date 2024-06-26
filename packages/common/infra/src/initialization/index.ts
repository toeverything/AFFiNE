import type { Doc } from '@blocksuite/store';

export function initEmptyPage(page: Doc, title?: string) {
  page.load(() => {
    const pageBlockId = page.addBlock(
      'affine:page' as keyof BlockSuite.BlockModels,
      {
        title: new page.Text(title ?? ''),
      }
    );
    page.addBlock(
      'affine:surface' as keyof BlockSuite.BlockModels,
      {},
      pageBlockId
    );
    const noteBlockId = page.addBlock(
      'affine:note' as keyof BlockSuite.BlockModels,
      {},
      pageBlockId
    );
    page.addBlock(
      'affine:paragraph' as keyof BlockSuite.BlockModels,
      {},
      noteBlockId
    );
    page.history.clear();
  });
}
