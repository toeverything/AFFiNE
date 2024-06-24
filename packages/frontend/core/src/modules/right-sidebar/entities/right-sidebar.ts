import type { GlobalState } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import type { SidebarTabName } from '../../multi-tab-sidebar';
import { RightSidebarView } from './right-sidebar-view';

const RIGHT_SIDEBAR_KEY = 'app:settings:rightsidebar';
const RIGHT_SIDEBAR_TABS_ACTIVE_KEY = 'app:settings:rightsidebar:tabs:active';
const RIGHT_SIDEBAR_AI_HAS_EVER_OPENED_KEY =
  'app:settings:rightsidebar:ai:has-ever-opened';

export class RightSidebar extends Entity {
  _disposables: Array<() => void> = [];
  constructor(private readonly globalState: GlobalState) {
    super();

    const sub = this.activeTabName$.subscribe(name => {
      if (name === 'chat') {
        this.globalState.set(RIGHT_SIDEBAR_AI_HAS_EVER_OPENED_KEY, true);
      }
    });
    this._disposables.push(() => sub.unsubscribe());
  }

  readonly isOpen$ = LiveData.from(
    this.globalState.watch<boolean>(RIGHT_SIDEBAR_KEY),
    false
  ).map(Boolean);
  readonly views$ = new LiveData<RightSidebarView[]>([]);
  readonly front$ = this.views$.map(
    stack => stack[0] as RightSidebarView | undefined
  );
  readonly hasViews$ = this.views$.map(stack => stack.length > 0);
  readonly activeTabName$ = LiveData.from(
    this.globalState.watch<SidebarTabName>(RIGHT_SIDEBAR_TABS_ACTIVE_KEY),
    null
  );

  /** To determine if AI chat has ever been opened, used to show the animation for the first time */
  readonly aiChatHasEverOpened$ = LiveData.from(
    this.globalState.watch<boolean>(RIGHT_SIDEBAR_AI_HAS_EVER_OPENED_KEY),
    false
  );

  override dispose() {
    super.dispose();
    this._disposables.forEach(dispose => dispose());
  }

  setActiveTabName(name: SidebarTabName) {
    this.globalState.set(RIGHT_SIDEBAR_TABS_ACTIVE_KEY, name);
  }

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
  _append() {
    const view = this.framework.createEntity(RightSidebarView);
    this.views$.next([...this.views$.value, view]);
    return view;
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
