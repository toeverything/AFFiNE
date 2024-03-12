import { LiveData } from '@toeverything/infra/livedata';

import type { RightSidebarView } from './right-sidebar-view';

export class RightSidebar {
  readonly isOpen = new LiveData(false);
  readonly views = new LiveData<RightSidebarView[]>([]);
  readonly front = this.views.map(
    stack => stack[0] as RightSidebarView | undefined
  );
  readonly hasViews = this.views.map(stack => stack.length > 0);

  open() {
    this.isOpen.next(true);
  }

  toggle() {
    this.isOpen.next(!this.isOpen.value);
  }

  close() {
    this.isOpen.next(false);
  }

  /**
   * @private use `RightSidebarViewIsland` instead
   */
  _append(view: RightSidebarView) {
    this.views.next([...this.views.value, view]);
  }

  /**
   * @private use `RightSidebarViewIsland` instead
   */
  _moveToFront(view: RightSidebarView) {
    if (this.views.value.includes(view)) {
      this.views.next([view, ...this.views.value.filter(v => v !== view)]);
    }
  }

  /**
   * @private use `RightSidebarViewIsland` instead
   */
  _remove(view: RightSidebarView) {
    this.views.next(this.views.value.filter(v => v !== view));
  }
}
