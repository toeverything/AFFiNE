import { Menu } from 'electron';

import { logger } from '../logger';
import {
  addTab,
  closeTab,
  reloadView,
  type TabAction,
  WebContentViewsManager,
} from './tab-views';

export const showTabContextMenu = async (tabId: string, viewIndex: number) => {
  const workbenches = WebContentViewsManager.instance.tabViewsMeta.workbenches;
  const tabMeta = workbenches.find(w => w.id === tabId);
  if (!tabMeta) {
    return;
  }

  const { resolve, promise } = Promise.withResolvers<TabAction | null>();

  const template: Parameters<typeof Menu.buildFromTemplate>[0] = [
    tabMeta.pinned
      ? {
          label: 'Unpin tab',
          click: () => {
            WebContentViewsManager.instance.pinTab(tabId, false);
          },
        }
      : {
          label: 'Pin tab',
          click: () => {
            WebContentViewsManager.instance.pinTab(tabId, true);
          },
        },
    {
      label: 'Refresh tab',
      click: () => {
        reloadView().catch(err => logger.error(err));
      },
    },
    {
      label: 'Duplicate tab',
      click: () => {
        addTab({
          basename: tabMeta.basename,
          view: tabMeta.views,
          show: false,
        }).catch(err => logger.error(err));
      },
    },

    { type: 'separator' },

    tabMeta.views.length > 1
      ? {
          label: 'Separate tabs',
          click: () => {
            WebContentViewsManager.instance.separateView(tabId, viewIndex);
          },
        }
      : {
          label: 'Open in split view',
          click: () => {
            WebContentViewsManager.instance.openInSplitView({ tabId });
          },
        },

    ...(workbenches.length > 1
      ? ([
          { type: 'separator' },
          {
            label: 'Close tab',
            click: () => {
              closeTab(tabId).catch(err => logger.error(err));
            },
          },
          {
            label: 'Close other tabs',
            click: () => {
              const tabsToRetain =
                WebContentViewsManager.instance.tabViewsMeta.workbenches.filter(
                  w => w.id === tabId || w.pinned
                );

              WebContentViewsManager.instance.patchTabViewsMeta({
                workbenches: tabsToRetain,
                activeWorkbenchId: tabId,
              });
            },
          },
        ] as const)
      : []),
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup();
  // eslint-disable-next-line prefer-const
  let unsub: (() => void) | undefined;
  const subscription = WebContentViewsManager.instance.tabAction$.subscribe(
    action => {
      resolve(action);
      unsub?.();
    }
  );
  menu.on('menu-will-close', () => {
    setTimeout(() => {
      resolve(null);
      unsub?.();
    });
  });
  unsub = () => {
    subscription.unsubscribe();
  };
  return promise;
};
