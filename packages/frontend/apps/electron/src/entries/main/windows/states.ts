import { Injectable } from '@nestjs/common';
import { map, shareReplay } from 'rxjs';

import {
  TabViewsMetaKey,
  type TabViewsMetaSchema,
  tabViewsMetaSchema,
} from '../../../shared/shared-state-schema';
import { GlobalStateStorage } from '../storage';

@Injectable()
export class TabViewsState {
  constructor(private readonly globalStateStorage: GlobalStateStorage) {}

  $ = this.globalStateStorage.watch<TabViewsMetaSchema>(TabViewsMetaKey).pipe(
    map(v => tabViewsMetaSchema.parse(v ?? {})),
    shareReplay(1)
  );

  set value(value: TabViewsMetaSchema) {
    this.globalStateStorage.set(TabViewsMetaKey, value);
  }

  get value() {
    return tabViewsMetaSchema.parse(
      this.globalStateStorage.get(TabViewsMetaKey) ?? {}
    );
  }

  // shallow merge
  patch(patch: Partial<TabViewsMetaSchema>) {
    this.value = {
      ...this.value,
      ...patch,
    };
  }
}
