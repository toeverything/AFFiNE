import {
  type GlobalState,
  type Memento,
  wrapMemento,
} from '@toeverything/infra';

import type { AppSidebarState } from '../providers/storage';

export class AppSidebarStateImpl implements AppSidebarState {
  wrapped: Memento;
  constructor(globalState: GlobalState) {
    this.wrapped = wrapMemento(globalState, `app-sidebar-state:`);
  }

  keys(): string[] {
    return this.wrapped.keys();
  }

  get<T>(key: string): T | undefined {
    return this.wrapped.get<T>(key);
  }

  watch<T>(key: string) {
    return this.wrapped.watch<T>(key);
  }

  set<T>(key: string, value: T): void {
    return this.wrapped.set<T>(key, value);
  }

  del(key: string): void {
    return this.wrapped.del(key);
  }

  clear(): void {
    return this.wrapped.clear();
  }
}
