import { LiveData } from '@toeverything/infra';
import type { Location } from 'history';
import { Observable, switchMap } from 'rxjs';

import type { Workbench } from '../../workbench';

export class Navigator {
  constructor(private readonly workbench: Workbench) {}

  private readonly history = this.workbench.activeView.map(
    view => view.history
  );

  private readonly location = LiveData.from(
    this.history.pipe(
      switchMap(
        history =>
          new Observable<{ index: number; entries: Location[] }>(subscriber => {
            subscriber.next({ index: history.index, entries: history.entries });
            return history.listen(() => {
              subscriber.next({
                index: history.index,
                entries: history.entries,
              });
            });
          })
      )
    ),
    { index: 0, entries: [] }
  );

  readonly backable = this.location.map(
    ({ index, entries }) => index > 0 && entries.length > 1
  );

  readonly forwardable = this.location.map(
    ({ index, entries }) => index < entries.length - 1
  );

  back() {
    if (!environment.isDesktop) {
      window.history.back();
    } else {
      this.history.value.back();
    }
  }

  forward() {
    if (!environment.isDesktop) {
      window.history.forward();
    } else {
      this.history.value.forward();
    }
  }
}
