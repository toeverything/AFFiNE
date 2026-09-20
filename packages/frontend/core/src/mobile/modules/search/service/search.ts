import {
  CollectionsQuickSearchSession,
  DocsQuickSearchSession,
  RecentDocsQuickSearchSession,
  TagsQuickSearchSession,
} from '@affine/core/modules/quicksearch';
import { LiveData, Service } from '@toeverything/infra';

export class MobileSearchService extends Service {
  readonly query$ = new LiveData('');
  readonly scrollAnchor$ = new LiveData(0);
  readonly resultVersion$ = new LiveData(0);
  readonly keyboardRestore = false;

  readonly recentDocs = this.framework.createEntity(
    RecentDocsQuickSearchSession
  );
  readonly collections = this.framework.createEntity(
    CollectionsQuickSearchSession
  );
  readonly docs = this.framework.createEntity(DocsQuickSearchSession);
  readonly tags = this.framework.createEntity(TagsQuickSearchSession);

  query(value: string) {
    this.query$.next(value);
    this.resultVersion$.next(this.resultVersion$.value + 1);
    this.recentDocs.query(value);
    this.collections.query(value);
    this.docs.query(value);
    this.tags.query(value);
  }
}
