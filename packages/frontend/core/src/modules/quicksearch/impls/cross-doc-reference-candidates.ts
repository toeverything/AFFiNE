import { FrameIcon, PageIcon, TableIcon } from '@blocksuite/icons/rc';
import { effect, Entity, LiveData } from '@toeverything/infra';
import { catchError, EMPTY, map, of, switchMap, throttleTime } from 'rxjs';

import type { DocsService } from '../../doc';
import type { DocDisplayMetaService } from '../../doc-display-meta';
import type { DocsSearchService } from '../../docs-search';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { QuickSearchItem } from '../types/item';

export interface CrossDocReferenceCandidatePayload {
  docId: string;
  blockIds: [string];
  flavour: 'affine:frame' | 'affine:database' | 'affine:note';
}

/**
 * Surfaces every Frame/Database/Note block in the workspace, except the
 * ones living in `excludeDocId` (the doc currently being edited) — powers
 * Story 0.3's cross-doc reference picker (Frame/Database), extended for
 * Note by Story 0.5. Reuses the existing QuickSearch dialog infrastructure
 * (see `QuickSearchProvider`) rather than a bespoke UI.
 */
export class CrossDocReferenceQuickSearchSession
  extends Entity<{
    excludeDocId: string;
    allowedFlavours?: ('affine:frame' | 'affine:database' | 'affine:note')[];
  }>
  implements
    QuickSearchSession<'cross-doc-reference', CrossDocReferenceCandidatePayload>
{
  constructor(
    private readonly docsSearchService: DocsSearchService,
    private readonly docsService: DocsService,
    private readonly docDisplayMetaService: DocDisplayMetaService
  ) {
    super();
  }

  items$ = new LiveData<
    QuickSearchItem<'cross-doc-reference', CrossDocReferenceCandidatePayload>[]
  >([]);

  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  query = effect(
    throttleTime<string>(300, undefined, { leading: false, trailing: true }),
    switchMap(query => {
      // An empty query is a deliberate "browse all" request, not "search
      // for nothing" — `watchCrossDocReferenceCandidates` already supports
      // this (an empty/`undefined` `query` skips its own text-match clause
      // entirely and returns every candidate of the allowed flavour(s), up
      // to its own pagination limit). Previously this short-circuited to
      // an empty result unconditionally, which meant there was no way to
      // list all candidates (e.g. every blank-titled table, or every table
      // living in a journal doc) without already knowing search text that
      // happens to match one — a real discoverability gap, not a deliberate
      // "type something first" UX choice.
      return this.docsSearchService
        .watchCrossDocReferenceCandidates(
          this.props.excludeDocId,
          query || undefined,
          this.props.allowedFlavours
        )
        .pipe(
          map(candidates => {
            const resolved = candidates
              .map(candidate => {
                const docRecord = this.docsService.list.doc$(
                  candidate.docId
                ).value;
                if (!docRecord) return null;

                const { title: pageTitle } =
                  this.docDisplayMetaService.getDocDisplayMeta(docRecord);
                const blockTitle =
                  candidate.label ||
                  (candidate.flavour === 'affine:frame'
                    ? 'Untitled Frame'
                    : candidate.flavour === 'affine:database'
                      ? 'Untitled Database'
                      : 'Untitled Note');

                return { candidate, pageTitle, blockTitle };
              })
              .filter((r): r is NonNullable<typeof r> => !!r);

            // With an actual search query, the indexer's own relevance
            // score (BM25-based, boosted for exact containing-doc-title
            // matches — see `watchCrossDocReferenceCandidates`) is what
            // should decide ranking — an exact/near-exact match must
            // outrank a document that merely shares one loose word with
            // the query. Previously this sorted purely alphabetically and
            // discarded the indexer's score entirely, which is exactly why
            // typing an exact page or table name didn't surface it first.
            //
            // With an empty query (browse-all mode, no query text to score
            // relevance against), every candidate scores identically, so
            // alphabetical-by-page-then-by-block remains the sensible
            // default for simply browsing everything.
            if (query) {
              resolved.sort((a, b) => b.candidate.score - a.candidate.score);
            } else {
              resolved.sort(
                (a, b) =>
                  a.pageTitle.localeCompare(b.pageTitle) ||
                  a.blockTitle.localeCompare(b.blockTitle)
              );
            }

            // `container.tsx` sorts groups/items by descending numeric
            // score. Each page's own group score is the best (highest) of
            // its items' scores, so a page containing a strong match still
            // surfaces above a page whose only match is weak — even if
            // that weaker-matching page happens to contain more items.
            const pageBestScore = new Map<string, number>();
            for (const { candidate } of resolved) {
              const prev = pageBestScore.get(candidate.docId) ?? -Infinity;
              if (candidate.score > prev) {
                pageBestScore.set(candidate.docId, candidate.score);
              }
            }

            return resolved.map(({ candidate, pageTitle, blockTitle }) => {
              return {
                id: `cross-doc-reference:${candidate.docId}:${candidate.blockId}`,
                source: 'cross-doc-reference',
                group: {
                  id: candidate.docId,
                  label: pageTitle,
                  score: pageBestScore.get(candidate.docId) ?? 0,
                },
                score: candidate.score,
                label: {
                  title: blockTitle,
                  subTitle: pageTitle,
                },
                icon:
                  candidate.flavour === 'affine:frame'
                    ? FrameIcon
                    : candidate.flavour === 'affine:database'
                      ? TableIcon
                      : PageIcon,
                payload: {
                  docId: candidate.docId,
                  blockIds: [candidate.blockId] as [string],
                  flavour: candidate.flavour,
                },
              } as QuickSearchItem<
                'cross-doc-reference',
                CrossDocReferenceCandidatePayload
              >;
            });
          }),
          catchError(error => {
            // Logged so a genuine failure (indexer error, schema mismatch)
            // is distinguishable from an honestly empty search result.
            console.error('[cross-doc-reference] search failed', error);
            this.error$.next(error);
            return of([]);
          })
        );
    }),
    map(items => {
      this.items$.next(items);
    }),
    catchError(() => EMPTY)
  );

  override dispose(): void {
    this.query.unsubscribe();
  }
}
