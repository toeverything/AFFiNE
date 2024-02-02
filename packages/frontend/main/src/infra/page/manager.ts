import type { PageMeta } from '@blocksuite/store';

import type { ServiceProvider } from '../di';
import { ObjectPool } from '../utils/object-pool';
import type { Workspace } from '../workspace';
import { configurePageContext } from './context';
import type { PageListService } from './list';
import { Page } from './page';
import { PageScope } from './service-scope';

export class PageManager {
  pool = new ObjectPool<string, Page>({});

  constructor(
    private readonly workspace: Workspace,
    private readonly pageList: PageListService,
    private readonly serviceProvider: ServiceProvider
  ) {}

  openByPageId(pageId: string) {
    const pageMeta = this.pageList.getPageMetaById(pageId);
    if (!pageMeta) {
      throw new Error('Page not found');
    }

    return this.open(pageMeta);
  }

  open(pageMeta: PageMeta) {
    const blockSuitePage = this.workspace.blockSuiteWorkspace.getPage(
      pageMeta.id
    );
    if (!blockSuitePage) {
      throw new Error('Page not found');
    }

    const exists = this.pool.get(pageMeta.id);
    if (exists) {
      return { page: exists.obj, release: exists.release };
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

    const { obj, release } = this.pool.put(pageMeta.id, page);

    return { page: obj, release };
  }
}
