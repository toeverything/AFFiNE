import { cmdFind } from '@affine/electron-api';
import { Entity, LiveData } from '@toeverything/infra';
import { Observable, of, switchMap } from 'rxjs';

type FindInPageResult = {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
  finalUpdate: boolean;
};
export class FindInPage extends Entity {
  // modal open/close

  readonly searchText$ = new LiveData<string | null>(null);
  private readonly direction$ = new LiveData<'forward' | 'backward'>('forward');
  readonly isSearching$ = new LiveData(false);

  readonly visible$ = new LiveData(false);

  readonly result$ = LiveData.from(
    this.searchText$.pipe(
      switchMap(searchText => {
        if (!searchText) {
          return of(null);
        } else {
          return new Observable<FindInPageResult>(subscriber => {
            const handleResult = (result: FindInPageResult) => {
              subscriber.next(result);
              if (result.finalUpdate) {
                subscriber.complete();
                this.isSearching$.next(false);
              }
            };
            this.isSearching$.next(true);
            cmdFind
              ?.findInPage(searchText, {
                forward: this.direction$.value === 'forward',
              })
              .then(() => cmdFind?.onFindInPageResult(handleResult))
              .catch(e => {
                console.error(e);
                this.isSearching$.next(false);
              });

            return () => {
              cmdFind?.offFindInPageResult(handleResult);
            };
          });
        }
      })
    ),
    { requestId: 0, activeMatchOrdinal: 0, matches: 0, finalUpdate: true }
  );

  constructor() {
    super();
  }

  findInPage(searchText: string) {
    this.searchText$.next(searchText);
  }

  private updateResult(result: FindInPageResult) {
    this.result$.next(result);
  }

  onChangeVisible(visible: boolean) {
    this.visible$.next(visible);
    if (!visible) {
      this.stopFindInPage('clearSelection');
    }
  }

  toggleVisible() {
    const nextVisible = !this.visible$.value;
    this.visible$.next(nextVisible);
    if (!nextVisible) {
      this.stopFindInPage('clearSelection');
    }
  }

  backward() {
    if (!this.searchText$.value) {
      return;
    }
    this.direction$.next('backward');
    this.searchText$.next(this.searchText$.value);
    cmdFind?.onFindInPageResult(result => this.updateResult(result));
  }

  forward() {
    if (!this.searchText$.value) {
      return;
    }
    this.direction$.next('forward');
    this.searchText$.next(this.searchText$.value);
    cmdFind?.onFindInPageResult(result => this.updateResult(result));
  }

  stopFindInPage(
    action: 'clearSelection' | 'keepSelection' | 'activateSelection'
  ) {
    if (action === 'clearSelection') {
      this.searchText$.next(null);
    }
    cmdFind?.stopFindInPage(action).catch(e => console.error(e));
  }
}
