import { Entity, LiveData } from '@toeverything/infra';
import type { Location, To } from 'history';
import { Observable } from 'rxjs';

import { createIsland } from '../../../utils/island';
import { createNavigableHistory } from '../../../utils/navigable-history';
import type { ViewScope } from '../scopes/view';

export class View extends Entity {
  id = this.scope.props.id;

  constructor(public readonly scope: ViewScope) {
    super();
    this.history = createNavigableHistory({
      initialEntries: [
        this.scope.props.defaultLocation ?? { pathname: '/all' },
      ],
      initialIndex: 0,
    });
  }

  history = createNavigableHistory({
    initialEntries: ['/all'],
    initialIndex: 0,
  });

  location$ = LiveData.from<Location>(
    new Observable(subscriber => {
      subscriber.next(this.history.location);
      return this.history.listen(update => {
        subscriber.next(update.location);
      });
    }),
    this.history.location
  );

  entries$ = LiveData.from<Location[]>(
    new Observable(subscriber => {
      subscriber.next(this.history.entries);
      return this.history.listen(() => {
        subscriber.next(this.history.entries);
      });
    }),
    this.history.entries
  );

  size$ = new LiveData(100);

  header = createIsland();
  body = createIsland();

  push(path: To) {
    this.history.push(path);
  }

  go(n: number) {
    this.history.go(n);
  }

  replace(path: To) {
    this.history.replace(path);
  }

  setSize(size?: number) {
    this.size$.next(size ?? 100);
  }
}
