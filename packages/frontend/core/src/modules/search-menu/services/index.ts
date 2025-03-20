import type {
  CollectionMeta,
  TagMeta,
} from '@affine/core/components/page-list';
import { fuzzyMatch } from '@affine/core/utils/fuzzy-match';
import { I18n } from '@affine/i18n';
import type {
  LinkedMenuGroup,
  LinkedMenuItem,
} from '@blocksuite/affine/blocks/root';
import { createSignalFromObservable } from '@blocksuite/affine/shared/utils';
import type { DocMeta } from '@blocksuite/affine/store';
import { CollectionsIcon } from '@blocksuite/icons/lit';
import { computed } from '@preact/signals-core';
import { Service } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import Fuse, { type FuseResultMatch } from 'fuse.js';
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { map, takeWhile } from 'rxjs';

import type { CollectionService } from '../../collection';
import type { DocDisplayMetaService } from '../../doc-display-meta';
import type { DocsSearchService } from '../../docs-search';
import { type RecentDocsService } from '../../quicksearch';
import { highlighter } from '../../quicksearch/utils/highlighter';
import type { TagService } from '../../tag';
import type { WorkspaceService } from '../../workspace';

const MAX_DOCS = 3;

type DocMetaWithHighlights = DocMeta & {
  highlights?: string;
};

export type SearchDocMenuAction = (meta: DocMeta) => Promise<void> | void;

export type SearchTagMenuAction = (tagId: TagMeta) => Promise<void> | void;

export type SearchCollectionMenuAction = (
  collection: CollectionMeta
) => Promise<void> | void;

export class SearchMenuService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docDisplayMetaService: DocDisplayMetaService,
    private readonly recentDocsService: RecentDocsService,
    private readonly docsSearch: DocsSearchService,
    private readonly tagService: TagService,
    private readonly collectionService: CollectionService
  ) {
    super();
  }

  getDocMenuGroup(
    query: string,
    action: SearchDocMenuAction,
    abortSignal: AbortSignal
  ): LinkedMenuGroup {
    const showRecent = query.trim().length === 0;
    if (showRecent) {
      return this.getRecentDocMenuGroup(action);
    } else {
      return this.getSearchDocMenuGroup(query, action, abortSignal);
    }
  }

  private getRecentDocMenuGroup(action: SearchDocMenuAction): LinkedMenuGroup {
    const currentWorkspace = this.workspaceService.workspace;
    const rawMetas = currentWorkspace.docCollection.meta.docMetas;
    const recentDocs = this.recentDocsService.getRecentDocs();
    return {
      name: I18n.t('com.affine.editor.at-menu.recent-docs'),
      items: recentDocs
        .map(doc => {
          const meta = rawMetas.find(meta => meta.id === doc.id);
          if (!meta) {
            return null;
          }
          return this.toDocMenuItem(meta, action);
        })
        .filter(m => !!m),
    };
  }

  private getSearchDocMenuGroup(
    query: string,
    action: SearchDocMenuAction,
    abortSignal: AbortSignal
  ): LinkedMenuGroup {
    const currentWorkspace = this.workspaceService.workspace;
    const rawMetas = currentWorkspace.docCollection.meta.docMetas;
    const { signal: docsSignal, cleanup: cleanupDocs } =
      createSignalFromObservable(
        this.searchDocs$(query).pipe(
          map(result => {
            const docs = result
              .map(doc => {
                const meta = rawMetas.find(meta => meta.id === doc.id);
                if (!meta) {
                  return null;
                }
                const highlights =
                  'highlights' in doc ? doc.highlights : undefined;
                return this.toDocMenuItem(
                  {
                    ...meta,
                    highlights,
                  },
                  action,
                  query
                );
              })
              .filter(m => !!m);
            return docs;
          })
        ),
        []
      );

    const { signal: isIndexerLoading, cleanup: cleanupIndexerLoading } =
      createSignalFromObservable(
        this.docsSearch.indexer.status$.pipe(
          map(status => status.remaining !== undefined && status.remaining > 0),
          takeWhile(isLoading => isLoading, true)
        ),
        false
      );

    const overflowText = computed(() => {
      const overflowCount = docsSignal.value.length - MAX_DOCS;
      return I18n.t('com.affine.editor.at-menu.more-docs-hint', {
        count: overflowCount > 100 ? '100+' : overflowCount,
      });
    });

    abortSignal.addEventListener('abort', () => {
      cleanupDocs();
      cleanupIndexerLoading();
    });

    return {
      name: I18n.t('com.affine.editor.at-menu.link-to-doc', {
        query,
      }),
      loading: isIndexerLoading,
      items: docsSignal,
      maxDisplay: MAX_DOCS,
      overflowText,
    };
  }

  // only search docs by title, excluding blocks
  private searchDocs$(query: string) {
    return this.docsSearch.indexer.docIndex
      .aggregate$(
        {
          type: 'boolean',
          occur: 'must',
          queries: [
            {
              type: 'match',
              field: 'title',
              match: query,
            },
          ],
        },
        'docId',
        {
          hits: {
            fields: ['docId', 'title'],
            pagination: {
              limit: 1,
            },
            highlights: [
              {
                field: 'title',
                before: `<span style="color: ${cssVarV2('text/emphasis')}">`,
                end: '</span>',
              },
            ],
          },
        }
      )
      .pipe(
        map(({ buckets }) =>
          buckets.map(bucket => {
            return {
              id: bucket.key,
              title: bucket.hits.nodes[0].fields.title,
              highlights: bucket.hits.nodes[0].highlights.title[0],
            };
          })
        )
      );
  }

  private toDocMenuItem(
    meta: DocMetaWithHighlights,
    action: SearchDocMenuAction,
    query?: string
  ): LinkedMenuItem | null {
    const title = this.docDisplayMetaService.title$(meta.id, {
      reference: true,
    }).value;

    if (meta.trash) {
      return null;
    }

    if (query && !fuzzyMatch(title, query)) {
      return null;
    }

    return {
      name: meta.highlights ? html`${unsafeHTML(meta.highlights)}` : title,
      key: meta.id,
      icon: this.docDisplayMetaService
        .icon$(meta.id, {
          type: 'lit',
          reference: true,
        })
        .value(),
      action: async () => {
        await action(meta);
      },
    };
  }

  private highlightFuseTitle(
    matches: readonly FuseResultMatch[] | undefined,
    title: string,
    key: string
  ): string {
    if (!matches) {
      return title;
    }
    const normalizedRange = ([start, end]: [number, number]) =>
      [
        start,
        end + 1 /* in fuse, the `end` is different from the `substring` */,
      ] as [number, number];
    const titleMatches = matches
      ?.filter(match => match.key === key)
      .flatMap(match => match.indices.map(normalizedRange));
    return (
      highlighter(
        title,
        `<span style="color: ${cssVarV2('text/emphasis')}">`,
        '</span>',
        titleMatches ?? []
      ) ?? title
    );
  }

  getTagMenuGroup(
    query: string,
    action: SearchTagMenuAction,
    _abortSignal: AbortSignal
  ): LinkedMenuGroup {
    const tags: TagMeta[] = this.tagService.tagList.tagMetas$.value;
    if (query.trim().length === 0) {
      return {
        name: I18n.t('com.affine.editor.at-menu.tags', {
          query,
        }),
        items: tags.map(tag => this.toTagMenuItem(tag, action)),
      };
    }

    const fuse = new Fuse(tags, {
      keys: ['title'],
      includeMatches: true,
      includeScore: true,
      ignoreLocation: true,
      threshold: 0.0,
    });
    const result = fuse.search(query);

    return {
      name: I18n.t('com.affine.editor.at-menu.link-to-doc', {
        query,
      }),
      items: result.map(item => {
        const title = this.highlightFuseTitle(
          item.matches,
          item.item.title,
          'title'
        );
        return this.toTagMenuItem({ ...item.item, title }, action);
      }),
    };
  }

  private toTagMenuItem(
    tag: TagMeta,
    action: SearchTagMenuAction
  ): LinkedMenuItem {
    const tagIcon = html`
      <div style="display: flex; align-items: center; justify-content: center;">
        <div
          style="border-radius: 50%; height: 8px; width: 8px; margin: 4px; background-color: ${tag.color};"
        ></div>
      </div>
    `;
    return {
      key: tag.id,
      name: html`${unsafeHTML(tag.title)}`,
      icon: tagIcon,
      action: async () => {
        await action(tag);
      },
    };
  }

  getCollectionMenuGroup(
    query: string,
    action: SearchCollectionMenuAction,
    _abortSignal: AbortSignal
  ): LinkedMenuGroup {
    const collections = this.collectionService.collections$.value;
    if (query.trim().length === 0) {
      return {
        name: I18n.t('com.affine.editor.at-menu.collections', {
          query,
        }),
        items: collections.map(collection =>
          this.toCollectionMenuItem(
            {
              ...collection,
              title: collection.name,
            },
            action
          )
        ),
      };
    }

    const fuse = new Fuse(collections, {
      keys: ['name'],
      includeMatches: true,
      includeScore: true,
      ignoreLocation: true,
      threshold: 0.0,
    });
    const result = fuse.search(query);

    return {
      name: I18n.t('com.affine.editor.at-menu.link-to-doc', {
        query,
      }),
      items: result.map(item => {
        const title = this.highlightFuseTitle(
          item.matches,
          item.item.name,
          'name'
        );
        return this.toCollectionMenuItem({ ...item.item, title }, action);
      }),
    };
  }

  private toCollectionMenuItem(
    collection: CollectionMeta,
    action: SearchCollectionMenuAction
  ): LinkedMenuItem {
    return {
      key: collection.id,
      name: html`${unsafeHTML(collection.title)}`,
      icon: CollectionsIcon(),
      action: async () => {
        await action(collection);
      },
    };
  }
}
