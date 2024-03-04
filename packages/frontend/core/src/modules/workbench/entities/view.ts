import { LiveData } from '@toeverything/infra';
import type { Location, To } from 'history';
import { createMemoryHistory } from 'history';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';

import { createIsland } from '../../../utils/island';

export class View {
  id = nanoid();

  history = createMemoryHistory();

  location = LiveData.from<Location>(
    new Observable(subscriber => {
      subscriber.next(this.history.location);
      return this.history.listen(update => {
        subscriber.next(update.location);
      });
    }),
    this.history.location
  );

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
}
