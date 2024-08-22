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

export type FontData = {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
};

export class SystemFontFamily extends Entity {
  constructor() {
    super();
  }

  readonly searchText$ = new LiveData<string | null>(null);
  readonly isLoading$ = new LiveData<boolean>(false);
  readonly fontList$ = new LiveData<FontData[]>([]);
  readonly result$ = LiveData.computed(get => {
    const fontList = get(this.fontList$);
    const searchText = get(this.searchText$);
    if (!searchText) {
      return fontList;
    }

    const filteredFonts = fontList.filter(font =>
      font.fullName.toLowerCase().includes(searchText.toLowerCase())
    );
    return filteredFonts;
  }).throttleTime(500);

  loadFontList = effect(
    exhaustMap(() => {
      return fromPromise(async () => {
        if (!(window as any).queryLocalFonts) {
          return [];
        }
        const fonts = await (window as any).queryLocalFonts();

        return fonts;
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
