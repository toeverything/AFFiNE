import { Menu } from 'electron';

import { logger } from '../logger';
import {
  addTab,
  closeTab,
  reloadView,
  WebContentViewsManager,
} from './tab-views';

export const showTabContextMenu = async (tabId: string, viewIndex: number) => {
  const workbenches = WebContentViewsManager.instance.tabViewsMeta.workbenches;
  const unpinned = workbenches.filter(w => !w.pinned);
  const tabMeta = workbenches.find(w => w.id === tabId);
  if (!tabMeta) {
    return;
  }

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
        reloadView().catch(logger.error);
      },
    },
    {
      label: 'Duplicate tab',
      click: () => {
        addTab({
          basename: tabMeta.basename,
          view: tabMeta.views,
          show: false,
        }).catch(logger.error);
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

    ...(unpinned.length > 0
      ? ([
          { type: 'separator' },
          {
            label: 'Close tab',
            click: () => {
              closeTab(tabId).catch(logger.error);
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
};
