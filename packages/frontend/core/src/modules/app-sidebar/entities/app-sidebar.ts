import { Entity, LiveData } from '@toeverything/infra';
import { map } from 'rxjs';

import type { AppSidebarState } from '../providers/storage';

const isMobile = !BUILD_CONFIG.isElectron && window.innerWidth < 768;

enum APP_SIDEBAR_STATE {
  OPEN = 'open',
  WIDTH = 'width',
}

export class AppSidebar extends Entity {
  constructor(private readonly appSidebarState: AppSidebarState) {
    super();
  }

  open$ = LiveData.from(
    this.appSidebarState
      .watch<boolean>(APP_SIDEBAR_STATE.OPEN)
      .pipe(map(value => value ?? !isMobile)),
    !isMobile
  );

  width$ = LiveData.from(
    this.appSidebarState
      .watch<number>(APP_SIDEBAR_STATE.WIDTH)
      .pipe(map(value => value ?? 248)),
    248
  );
  responsiveFloating$ = new LiveData<boolean>(isMobile);
  hoverFloating$ = new LiveData<boolean>(false);
  resizing$ = new LiveData<boolean>(false);

  showFloatToPinAnimation$ = new LiveData<boolean>(false);

  getCachedAppSidebarOpenState = () => {
    return this.appSidebarState.get<boolean>(APP_SIDEBAR_STATE.OPEN);
  };

  toggleSidebar = () => {
    this.setOpen(!this.open$.value);
  };

  setOpen = (open: boolean) => {
    this.appSidebarState.set(APP_SIDEBAR_STATE.OPEN, open);
    if (!open && this.hoverFloating$.value) {
      const timeout = setTimeout(() => {
        this.setHoverFloating(false);
      }, 500);
      return () => {
        clearTimeout(timeout);
      };
    }
    return;
  };

  setResponsiveFloating = (floating: boolean) => {
    this.responsiveFloating$.next(floating);
  };

  setHoverFloating = (hoverFloating: boolean) => {
    if (hoverFloating) {
      this.showFloatToPinAnimation$.next(false);
    }
    this.hoverFloating$.next(hoverFloating);
  };

  setResizing = (resizing: boolean) => {
    this.resizing$.next(resizing);
  };

  setWidth = (width: number) => {
    this.appSidebarState.set(APP_SIDEBAR_STATE.WIDTH, width);
  };

  setShowFloatToPinAnimation = (show: boolean) => {
    this.showFloatToPinAnimation$.next(show);
  };
}
