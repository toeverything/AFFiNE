import type {
  DocRecord,
  DocsService,
  WorkspaceService,
} from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import { resolveLinkToDoc } from '../../navigation';

type QuickSearchMode = 'commands' | 'docs';

export type SearchCallbackResult =
  | {
      docId: string;
      blockId?: string;
      isNewDoc?: boolean;
    }
  | {
      query: string;
      action: 'insert';
    };

// todo: move command registry to entity as well
export class QuickSearch extends Entity {
  constructor(
    private readonly docsService: DocsService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }
  private readonly state$ = new LiveData<{
    mode: QuickSearchMode;
    query: string;
    callback?: (result: SearchCallbackResult | null) => void;
  } | null>(null);

  readonly show$ = this.state$.map(s => !!s);

  show = (
    mode: QuickSearchMode | null = 'commands',
    opts: {
      callback?: (res: SearchCallbackResult | null) => void;
      query?: string;
    } = {}
  ) => {
    if (this.state$.value?.callback) {
      this.state$.value.callback(null);
    }
    if (mode === null) {
      this.state$.next(null);
    } else {
      this.state$.next({
        mode,
        query: opts.query ?? '',
        callback: opts.callback,
      });
    }
  };

  mode$ = this.state$.map(s => s?.mode);
  query$ = this.state$.map(s => s?.query || '');

  setQuery = (query: string) => {
    if (!this.state$.value) return;
    this.state$.next({
      ...this.state$.value,
      query,
    });
  };

  hide() {
    return this.show(null);
  }

  toggle() {
    return this.show$.value ? this.hide() : this.show();
  }

  search(query?: string) {
    const { promise, resolve } =
      Promise.withResolvers<SearchCallbackResult | null>();

    this.show('docs', {
      callback: resolve,
      query,
    });

    return promise;
  }

  setSearchCallbackResult(result: SearchCallbackResult) {
    if (this.state$.value?.callback) {
      this.state$.value.callback(result);
    }
  }

  getSearchedDocs(query: string) {
    const searchResults = this.workspaceService.workspace.docCollection.search(
      query
    ) as unknown as Map<
      string,
      {
        space: string;
        content: string;
      }
    >;
    // make sure we don't add the same page multiple times
    const added = new Set<string>();
    const docs = this.docsService.list.docs$.value;
    const searchedDocs: {
      doc: DocRecord;
      blockId: string;
      content?: string;
      source: 'search' | 'link-ref';
    }[] = Array.from(searchResults.entries())
      .map(([blockId, { space, content }]) => {
        const doc = docs.find(doc => doc.id === space && !added.has(doc.id));
        if (!doc) return null;
        added.add(doc.id);

        return {
          doc,
          blockId,
          content,
          source: 'search' as const,
        };
      })
      .filter((res): res is NonNullable<typeof res> => !!res);

    const maybeRefLink = resolveLinkToDoc(query);

    if (maybeRefLink) {
      const doc = this.docsService.list.docs$.value.find(
        doc => doc.id === maybeRefLink.docId
      );
      if (doc) {
        searchedDocs.push({
          doc,
          blockId: maybeRefLink.blockId,
          source: 'link-ref',
        });
      }
    }

    return searchedDocs;
  }
}
