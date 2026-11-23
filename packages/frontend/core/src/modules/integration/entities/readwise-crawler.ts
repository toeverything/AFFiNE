import {
  effect,
  Entity,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { catchError, EMPTY, Observable, switchMap, tap } from 'rxjs';

import type { ReadwiseStore } from '../store/readwise';
import type {
  ReadwiseBook,
  ReadwiseBookMap,
  ReadwiseCrawlingData,
  ReadwiseHighlight,
  ReadwiseResponse,
} from '../type';

export class ReadwiseCrawler extends Entity {
  public crawling$ = new LiveData(false);
  public data$ = new LiveData<ReadwiseCrawlingData | null>({
    highlights: [],
    books: {},
    complete: false,
  });
  public error$ = new LiveData<Error | null>(null);

  constructor(private readonly readwiseStore: ReadwiseStore) {
    super();
  }

  private authHeaders(token: string) {
    return { Authorization: `Token ${token}` };
  }

  private async fetchHighlights(options: {
    token: string;
    lastImportedAt?: string;
    pageCursor?: string;
    signal?: AbortSignal;
  }) {
    const queryParams = new URLSearchParams();
    if (options.pageCursor) {
      queryParams.set('pageCursor', options.pageCursor);
    }
    if (options.lastImportedAt) {
      queryParams.set('updatedAfter', options.lastImportedAt);
    }
    const response = await fetch(
      'https://readwise.io/api/v2/export/?' + queryParams.toString(),
      {
        method: 'GET',
        headers: this.authHeaders(options.token),
        signal: options.signal,
      }
    );
    const responseJson = (await response.json()) as ReadwiseResponse;

    const highlights: ReadwiseHighlight[] = [];
    const books: ReadwiseBookMap = {};
    highlights.push(
      ...responseJson.results.flatMap((book: ReadwiseBook) => book.highlights)
    );
    responseJson.results.forEach((book: ReadwiseBook) => {
      if (books[book.user_book_id]) return;
      const { highlights: _, ...copy } = book;
      books[book.user_book_id] = copy;
    });

    return { highlights, books, nextPageCursor: responseJson.nextPageCursor };
  }

  async verifyToken(token: string) {
    const response = await fetch('https://readwise.io/api/v2/auth/', {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    return !!(response.ok && response.status === 204);
  }

  crawl = effect(
    switchMap(() => {
      return new Observable<ReadwiseCrawlingData>(sub => {
        const token = this.readwiseStore.getSetting('token');
        const lastImportedAt = this.readwiseStore.getSetting('lastImportedAt');

        if (!token) {
          throw new Error('Readwise token is required to crawl highlights');
        }

        const allHighlights: ReadwiseHighlight[] = [];
        const allBooks: ReadwiseBookMap = {};
        const startTime = new Date().toISOString();

        let abortController: AbortController | null = null;

        const fetchNextPage = (pageCursor?: number) => {
          abortController = new AbortController();
          this.fetchHighlights({
            token,
            lastImportedAt,
            pageCursor: pageCursor?.toString(),
            signal: abortController.signal,
          })
            .then(({ highlights, books, nextPageCursor }) => {
              allHighlights.push(...highlights);
              Object.assign(allBooks, books);

              const complete = !nextPageCursor;

              sub.next({
                highlights: allHighlights,
                books: allBooks,
                complete,
                startTime,
              });

              if (!complete) {
                fetchNextPage(nextPageCursor);
              } else {
                sub.complete();
              }
            })
            .catch(error => sub.error(error));
        };

        fetchNextPage();
        return () => {
          abortController?.abort();
        };
      }).pipe(
        tap(data => {
          this.data$.next(data);
        }),
        catchError(err => {
          this.error$.next(err);
          return EMPTY;
        }),
        onStart(() => {
          // reset state
          this.crawling$.next(true);
          this.data$.next({
            highlights: [],
            books: {},
            complete: false,
          });
          this.error$.next(null);
        }),
        onComplete(() => {
          this.crawling$.next(false);
        })
      );
    })
  );

  abort() {
    this.crawl.reset();
  }

  reset() {
    this.abort();
    this.crawling$.next(false);
    this.data$.next({
      highlights: [],
      books: {},
      complete: false,
    });
  }

  override dispose(): void {
    super.dispose();
    this.crawl.unsubscribe();
  }
}
