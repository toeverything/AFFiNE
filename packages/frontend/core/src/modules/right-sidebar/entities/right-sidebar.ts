import { LiveData } from '@toeverything/infra/livedata';
import type { GlobalState } from '@toeverything/infra/storage';

import type { RightSidebarView } from './right-sidebar-view';

const RIGHT_SIDEBAR_KEY = 'app:settings:rightsidebar';

export class RightSidebar {
  constructor(private readonly globalState: GlobalState) {}
  readonly isOpen$ = LiveData.from(
    this.globalState.watch<boolean>(RIGHT_SIDEBAR_KEY),
    false
  ).map(Boolean);
  readonly views$ = new LiveData<RightSidebarView[]>([]);
  readonly front$ = this.views$.map(
    stack => stack[0] as RightSidebarView | undefined
  );
  readonly hasViews$ = this.views$.map(stack => stack.length > 0);

  open() {
    this._set(true);
  }

  toggle() {
    this._set(!this.isOpen$.value);
  }

  close() {
    this._set(false);
  }

  _set(value: boolean) {
    this.globalState.set(RIGHT_SIDEBAR_KEY, value);
  }

  /**
   * @private use `RightSidebarViewIsland` instead
   */
  _append(view: RightSidebarView) {
    this.views$.next([...this.views$.value, view]);
  }

  /**
   * @private use `RightSidebarViewIsland` instead
   */
  _moveToFront(view: RightSidebarView) {
    if (this.views$.value.includes(view)) {
      this.views$.next([view, ...this.views$.value.filter(v => v !== view)]);
    }
  }

  /**
   * @private use `RightSidebarViewIsland` instead
   */
  _remove(view: RightSidebarView) {
    this.views$.next(this.views$.value.filter(v => v !== view));
  }
}
