import { apis } from '@affine/electron-api';
import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  mapInto,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { exhaustMap } from 'rxjs';

export class SystemFontFamily extends Entity {
  constructor() {
    super();
  }

  readonly searchText$ = new LiveData<string | null>(null);
  readonly isLoading$ = new LiveData<boolean>(false);
  readonly fontList$ = new LiveData<string[]>([]);
  readonly result$ = LiveData.computed(get => {
    const fontList = get(this.fontList$);
    const searchText = get(this.searchText$);
    if (!searchText) {
      return fontList;
    }

    const filteredFonts = fontList.filter(font =>
      font.toLowerCase().includes(searchText.toLowerCase())
    );
    return filteredFonts;
  }).throttleTime(500);

  loadFontList = effect(
    exhaustMap(() => {
      return fromPromise(async () => {
        if (!apis?.fontList) {
          return [];
        }
        return apis.fontList.getSystemFonts();
      }).pipe(
        mapInto(this.fontList$),
        // TODO: catchErrorInto(this.error$),
        onStart(() => {
          this.isLoading$.next(true);
        }),
        onComplete(() => {
          this.isLoading$.next(false);
        })
      );
    })
  );

  search(searchText: string) {
    this.searchText$.next(searchText);
  }

  clearSearch() {
    this.searchText$.next(null);
  }
}
