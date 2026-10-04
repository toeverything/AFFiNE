import { LiveData, Service } from '@toeverything/infra';
import {
  concat,
  distinctUntilChanged,
  firstValueFrom,
  from,
  map,
  type Observable,
  of,
  switchMap,
} from 'rxjs';

import type { DocsService } from '../../doc';
import type { DocsSearchService } from '../../docs-search';

/**
 * Upper bound of ancestors to resolve, guards against very deep link chains.
 */
const MAX_ANCESTORS_DEPTH = 10;

export interface ParentDocCandidate {
  id: string;
  createDate?: number;
  isJournal: boolean;
}

/**
 * A doc can be linked from many docs, so it has no single parent.
 * Pick the most likely "containing" doc: non-journal docs first
 * (journals tend to mention docs rather than contain them), then the
 * oldest doc, then by id to keep the result stable.
 */
export function pickParentDoc(candidates: ParentDocCandidate[]): string | null {
  let best: ParentDocCandidate | null = null;
  for (const candidate of candidates) {
    if (!best || compareCandidates(candidate, best) < 0) {
      best = candidate;
    }
  }
  return best?.id ?? null;
}

function compareCandidates(a: ParentDocCandidate, b: ParentDocCandidate) {
  if (a.isJournal !== b.isJournal) {
    return a.isJournal ? 1 : -1;
  }
  const aDate = a.createDate ?? Number.MAX_SAFE_INTEGER;
  const bDate = b.createDate ?? Number.MAX_SAFE_INTEGER;
  if (aDate !== bDate) {
    return aDate - bDate;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Resolves the chain of docs that (transitively) link to a doc, which is
 * the same tree shown by the linked docs in the navigation panel.
 */
export class DocAncestorsService extends Service {
  constructor(
    private readonly docsSearchService: DocsSearchService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  /**
   * Watch the ancestors of a doc, ordered from the root to the direct parent.
   *
   * Only the direct parent is watched live. The ancestors above it are looked
   * up once each time the direct parent changes, so an opened doc keeps a
   * single indexer subscription however deep its chain of linking docs is.
   */
  watchAncestors(docId: string): Observable<string[]> {
    return this.watchParent(docId, [docId]).pipe(
      switchMap(parentId =>
        parentId
          ? concat(
              of([parentId]),
              from(this.resolveAncestors(parentId, [docId, parentId])).pipe(
                map(ancestors => [...ancestors, parentId])
              )
            )
          : of([])
      ),
      distinctUntilChanged(
        (previous, current) =>
          previous.length === current.length &&
          previous.every((id, index) => id === current[index])
      )
    );
  }

  /**
   * Resolve the ancestors of a doc once, ordered from the root to the direct
   * parent. Stops at cycles and at {@link MAX_ANCESTORS_DEPTH} docs.
   */
  private async resolveAncestors(
    docId: string,
    visited: string[]
  ): Promise<string[]> {
    const ancestors: string[] = [];
    const seen = [...visited];
    let current = docId;
    while (seen.length <= MAX_ANCESTORS_DEPTH) {
      const parentId = await firstValueFrom(this.watchParent(current, seen));
      if (!parentId) break;
      ancestors.unshift(parentId);
      seen.push(parentId);
      current = parentId;
    }
    return ancestors;
  }

  private watchParent(
    docId: string,
    excludes: string[]
  ): Observable<string | null> {
    return this.docsSearchService.watchRefsTo(docId).pipe(
      switchMap(sourceIds =>
        LiveData.computed(get => {
          const docs = get(this.docsService.list.docsMap$);
          return pickParentDoc(
            sourceIds.flatMap(id => {
              const record = docs.get(id);
              if (!record || excludes.includes(id)) return [];
              const meta = get(record.meta$);
              if (meta.trash) return [];
              return [
                {
                  id,
                  createDate: meta.createDate,
                  isJournal: !!get(record.properties$).journal,
                },
              ];
            })
          );
        })
      ),
      distinctUntilChanged()
    );
  }
}
