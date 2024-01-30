import type { PageMeta } from '@blocksuite/store';

import type { ServiceProvider } from '../di';
import { ObjectPool, type RcRef } from '../utils/object-pool';
import type { Workspace } from '../workspace';
import { configurePageContext } from './context';
import { Page } from './page';
import { PageScope } from './service-scope';

export class PageManager {
  pool = new ObjectPool<string, Page>({});

  constructor(
    private readonly workspace: Workspace,
    private readonly serviceProvider: ServiceProvider
  ) {}

  open(pageMeta: PageMeta): RcRef<Page> {
    const blockSuitePage = this.workspace.blockSuiteWorkspace.getPage(
      pageMeta.id
    );
    if (!blockSuitePage) {
      throw new Error('Page not found');
    }

    const exists = this.pool.get(pageMeta.id);
    if (exists) {
      return exists;
    }

    const serviceCollection = this.serviceProvider.collection
      // avoid to modify the original service collection
      .clone();

    configurePageContext(serviceCollection, blockSuitePage, pageMeta);

    const provider = serviceCollection.provider(
      PageScope,
      this.serviceProvider
    );

    const page = provider.get(Page);

    return this.pool.put(pageMeta.id, page);
  }
}
