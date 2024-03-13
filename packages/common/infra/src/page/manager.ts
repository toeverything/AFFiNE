import type { ServiceProvider } from '../di';
import { ObjectPool } from '../utils/object-pool';
import type { Workspace } from '../workspace';
import type { PageRecordList } from '.';
import { configurePageContext } from './context';
import { Doc } from './page';
import { PageScope } from './service-scope';

export class PageManager {
  pool = new ObjectPool<string, Doc>({});

  constructor(
    private readonly workspace: Workspace,
    private readonly pageRecordList: PageRecordList,
    private readonly serviceProvider: ServiceProvider
  ) {}

  open(pageId: string) {
    const pageRecord = this.pageRecordList.record(pageId).value;
    if (!pageRecord) {
      throw new Error('Page record not found');
    }
    const blockSuitePage = this.workspace.docCollection.getDoc(pageId);
    if (!blockSuitePage) {
      throw new Error('Page not found');
    }

    const exists = this.pool.get(pageId);
    if (exists) {
      return { page: exists.obj, release: exists.release };
    }

    const serviceCollection = this.serviceProvider.collection
      // avoid to modify the original service collection
      .clone();

    configurePageContext(serviceCollection, blockSuitePage, pageRecord);

    const provider = serviceCollection.provider(
      PageScope,
      this.serviceProvider
    );

    const page = provider.get(Doc);

    const { obj, release } = this.pool.put(pageId, page);

    return { page: obj, release };
  }
}
