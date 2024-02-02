import type { Page as BlockSuitePage, PageMeta } from '@blocksuite/store';

import { createIdentifier, type ServiceCollection } from '../di';
import { PageScope } from './service-scope';

export const BlockSuitePageContext = createIdentifier<BlockSuitePage>(
  'BlockSuitePageContext'
);

export const PageMetaContext = createIdentifier<PageMeta>('PageMetaContext');

export function configurePageContext(
  services: ServiceCollection,
  blockSuitePage: BlockSuitePage,
  pageMeta: PageMeta
) {
  services
    .scope(PageScope)
    .addImpl(PageMetaContext, pageMeta)
    .addImpl(BlockSuitePageContext, blockSuitePage);
}
