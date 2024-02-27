import type { Page as BlockSuitePage } from '@blocksuite/store';

import { createIdentifier, type ServiceCollection } from '../di';
import type { PageRecord } from './record';
import { PageScope } from './service-scope';

export const BlockSuitePageContext = createIdentifier<BlockSuitePage>(
  'BlockSuitePageContext'
);

export const PageRecordContext =
  createIdentifier<PageRecord>('PageRecordContext');

export function configurePageContext(
  services: ServiceCollection,
  blockSuitePage: BlockSuitePage,
  pageRecord: PageRecord
) {
  services
    .scope(PageScope)
    .addImpl(PageRecordContext, pageRecord)
    .addImpl(BlockSuitePageContext, blockSuitePage);
}
