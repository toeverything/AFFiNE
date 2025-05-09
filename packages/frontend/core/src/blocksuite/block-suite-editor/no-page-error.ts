import type { Store } from '@blocksuite/affine/store';
import type { Doc as YDoc, Map as YMap } from 'yjs';

/**
 * TODO(@eyhn): Define error to unexpected state together in the future.
 */
export class NoPageRootError extends Error {
  constructor(public page: Store) {
    super('Page root not found when render editor!');

    // Log info to let sentry collect more message
    const hasExpectSpace = Array.from(
      page.rootDoc.getMap<YDoc>('spaces').values()
    ).some(doc => page.spaceDoc.guid === doc.guid);
    const blocks = page.spaceDoc.getMap('blocks') as YMap<YMap<any>>;
    const havePageBlock = Array.from(blocks.values()).some(
      block => block.get('sys:flavour') === 'affine:page'
    );
    console.info(
      'NoPageRootError current data: %s',
      JSON.stringify({
        expectPageId: page.id,
        expectGuid: page.spaceDoc.guid,
        hasExpectSpace,
        blockSize: blocks.size,
        havePageBlock,
      })
    );
  }
}
