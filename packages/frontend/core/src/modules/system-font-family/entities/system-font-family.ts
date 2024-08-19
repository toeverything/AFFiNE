import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';
import { Entity, LiveData } from '@toeverything/infra';
import {
  debounceTime,
  distinctUntilChanged,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';

const logger = new DebugLogger('affine:system-font-family');

export class SystemFontFamily extends Entity {
  constructor() {
    super();
    this.loadFontList().catch(error => {
      logger.error('Failed to load system font list', error);
    });
  }

  readonly searchText$ = new LiveData<string | null>(null);
  readonly isLoading$ = new LiveData<boolean>(false);
  readonly fontList$ = new LiveData<string[]>([]);
  readonly result$ = LiveData.from(
    this.searchText$.pipe(
      distinctUntilChanged(),
      debounceTime(500),
      switchMap(searchText => {
        if (!searchText) {
          return of([]);
        }
        return this.fontList$.pipe(
          tap(() => {
            this.isLoading$.next(true);
          }),
          switchMap(fontList => {
            const filteredFonts = fontList.filter(font =>
              font.toLowerCase().includes(searchText.toLowerCase())
            );
            this.isLoading$.next(false);
            return of(filteredFonts);
          })
        );
      }),
      shareReplay({
        bufferSize: 1,
        refCount: true,
      })
    ),
    []
  );

  async loadFontList() {
    if (!apis?.fontList) {
      return;
    }
    try {
      this.isLoading$.next(true);
      const fontList = await apis.fontList.getSystemFonts();
      this.fontList$.next(fontList);
    } catch (error) {
      logger.error('Failed to load system font list', error);
    } finally {
      this.isLoading$.next(false);
    }
  }

  search(searchText: string) {
    if (!this.searchText$.value) return;
    this.searchText$.next(searchText);
  }

  clearSearch() {
    if (!this.searchText$.value) return;
    this.searchText$.next(null);
  }
}
