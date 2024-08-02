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

  showContextMenu = apis?.ui.showTabContextMenu;

  activateView = apis?.ui.activateView;

  closeTab = apis?.ui.closeTab;

  onAddTab = apis?.ui.addTab;

  onAddDocTab = async (
    docId: string,
    targetTabId?: string,
    edge?: 'left' | 'right'
  ) => {
    await apis?.ui.addTab({
      view: {
        path: {
          pathname: '/' + docId,
        },
      },
      target: targetTabId,
      edge,
    });
  };

  onAddTagTab = async (
    tagId: string,
    targetTabId?: string,
    edge?: 'left' | 'right'
  ) => {
    await apis?.ui.addTab({
      view: {
        path: {
          pathname: '/tag/' + tagId,
        },
      },
      target: targetTabId,
      edge,
    });
  };

  onAddCollectionTab = async (
    collectionId: string,
    targetTabId?: string,
    edge?: 'left' | 'right'
  ) => {
    await apis?.ui.addTab({
      view: {
        path: {
          pathname: '/collection/' + collectionId,
        },
      },
      target: targetTabId,
      edge,
    });
  };

  onToggleRightSidebar = apis?.ui.toggleRightSidebar;

  moveTab = apis?.ui.moveTab;
}
