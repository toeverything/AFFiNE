import { DebugLogger } from '@affine/debug';
import { Entity, LiveData } from '@toeverything/infra';
import {
  debounceTime,
  distinctUntilChanged,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';

import type { DesktopApiService } from '../../desktop-api';

const logger = new DebugLogger('affine:find-in-page');

export class FindInPage extends Entity {
  readonly searchText$ = new LiveData<string | null>(null);
  readonly isSearching$ = new LiveData(false);
  private readonly direction$ = new LiveData<'forward' | 'backward'>('forward');
  readonly visible$ = new LiveData(false);

  readonly result$ = LiveData.from(
    this.visible$.pipe(
      distinctUntilChanged(),
      switchMap(visible => {
        if (!visible) {
          return of(null);
        }
        let searchId = 0;
        return this.searchText$.pipe(
          tap(() => {
            this.isSearching$.next(false);
          }),
          debounceTime(500),
          switchMap(searchText => {
            if (!searchText) {
              return of(null);
            } else {
              let findNext = true;
              return this.direction$.pipe(
                switchMap(direction => {
                  if (this.electronApi?.handler?.findInPage) {
                    this.isSearching$.next(true);
                    const currentId = ++searchId;
                    return this.electronApi.handler.findInPage
                      .find(searchText, {
                        forward: direction === 'forward',
                        findNext,
                      })
                      .finally(() => {
                        if (currentId === searchId) {
                          this.isSearching$.next(false);
                          findNext = false;
                        }
                      });
                  } else {
                    return of(null);
                  }
                })
              );
            }
          })
        );
      }),
      shareReplay({
        bufferSize: 1,
        refCount: true,
      })
    ),
    null
  );

  constructor(private readonly electronApi: DesktopApiService) {
    super();
    // TODO(@Peng): hide on navigation
  }

  findInPage(searchText?: string) {
    this.onChangeVisible(true);
    if (searchText !== undefined) {
      this.searchText$.next(searchText);
    }
  }

  onChangeVisible(visible: boolean) {
    this.visible$.next(visible);
    if (!visible) {
      this.clear();
    }
  }

  toggleVisible(text?: string) {
    const nextVisible = !this.visible$.value;
    this.visible$.next(nextVisible);
    if (!nextVisible) {
      this.clear();
    } else if (text) {
      this.searchText$.next(text);
    }
  }

  backward() {
    if (!this.searchText$.value) {
      return;
    }
    this.direction$.next('backward');
  }

  forward() {
    if (!this.searchText$.value) {
      return;
    }
    this.direction$.next('forward');
  }

  clear() {
    logger.debug('clear');
    this.electronApi.handler.findInPage.clear().catch(logger.error);
  }
}
