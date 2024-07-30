import { apis, events } from '@affine/electron-api';
import { LiveData, Service } from '@toeverything/infra';
import { Observable } from 'rxjs';

export type TabStatus = Parameters<
  Parameters<NonNullable<typeof events>['ui']['onTabsStatusChange']>[0]
>[0][number];

export class AppTabsHeaderService extends Service {
  constructor() {
    super();
  }

  tabsStatus$ = LiveData.from<TabStatus[]>(
    new Observable(subscriber => {
      let unsub: (() => void) | undefined;
      apis?.ui
        .getTabsStatus()
        .then(tabs => {
          subscriber.next(tabs);
          unsub = events?.ui.onTabsStatusChange(tabs => {
            subscriber.next(tabs);
          });
        })
        .catch(console.error);

      return () => {
        unsub?.();
      };
    }),
    []
  );

  showContextMenu = async (workbenchId: string, viewIdx: number) => {
    await apis?.ui.showTabContextMenu(workbenchId, viewIdx);
  };

  activateView = async (workbenchId: string, viewIdx: number) => {
    await apis?.ui.activateView(workbenchId, viewIdx);
  };

  closeTab = async (workbenchId: string) => {
    await apis?.ui.closeTab(workbenchId);
  };

  onAddTab = async () => {
    await apis?.ui.addTab();
  };

  onToggleRightSidebar = async () => {
    await apis?.ui.toggleRightSidebar();
  };
}
