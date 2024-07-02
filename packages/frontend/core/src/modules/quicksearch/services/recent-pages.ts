import type {
  DocRecord,
  DocsService,
  WorkspaceLocalState,
} from '@toeverything/infra';
import { Service } from '@toeverything/infra';

const RECENT_PAGES_LIMIT = 3; // adjust this?
const RECENT_PAGES_KEY = 'recent-pages';

const EMPTY_ARRAY: string[] = [];

export class RecentDocsService extends Service {
  constructor(
    private readonly localState: WorkspaceLocalState,
    private readonly docsService: DocsService
  ) {
    super();
  }

  addRecentDoc(pageId: string) {
    let recentPages = this.getRecentDocIds();
    recentPages = recentPages.filter(id => id !== pageId);
    if (recentPages.length >= RECENT_PAGES_LIMIT) {
      recentPages.pop();
    }
    recentPages.unshift(pageId);
    this.localState.set(RECENT_PAGES_KEY, recentPages);
  }

  getRecentDocs() {
    const docs = this.docsService.list.docs$.value;
    return this.getRecentDocIds()
      .map(id => docs.find(doc => doc.id === id))
      .filter((d): d is DocRecord => !!d);
  }

  private getRecentDocIds() {
    return (
      this.localState.get<string[] | null>(RECENT_PAGES_KEY) || EMPTY_ARRAY
    );
  }
}
