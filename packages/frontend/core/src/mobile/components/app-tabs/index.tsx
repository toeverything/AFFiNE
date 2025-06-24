import { SafeArea } from '@affine/component';
import { GlobalCacheService } from '@affine/core/modules/storage';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { VirtualKeyboardService } from '../../modules/virtual-keyboard/services/virtual-keyboard';
import { cacheKey } from './constants';
import { tabs } from './data';
import * as styles from './styles.css';
import { TabItem } from './tab-item';
import type { AppTabLink } from './type';

export const AppTabs = ({
  background,
  fixed = true,
}: {
  background?: string;
  fixed?: boolean;
}) => {
  const virtualKeyboardService = useService(VirtualKeyboardService);
  const virtualKeyboardVisible = useLiveData(virtualKeyboardService.visible$);
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);
  const globalCache = useService(GlobalCacheService).globalCache;

  // always set the active tab to home when the location is changed to home
  useEffect(() => {
    if (location.pathname === '/home') {
      globalCache.set(cacheKey, 'home');
    }
  }, [globalCache, location.pathname]);

  const tab = (
    <SafeArea
      id="app-tabs"
      bottom
      className={styles.appTabs}
      bottomOffset={2}
      data-fixed={fixed}
      style={{
        ...assignInlineVars({
          [styles.appTabsBackground]: background,
        }),
        visibility: virtualKeyboardVisible ? 'hidden' : 'visible',
      }}
    >
      <ul className={styles.appTabsInner} role="tablist">
        {tabs.map(tab => {
          if ('to' in tab) {
            return <AppTabLink route={tab} key={tab.key} />;
          } else {
            return (
              <React.Fragment key={tab.key}>
                {<tab.custom tab={tab} />}
              </React.Fragment>
            );
          }
        })}
      </ul>
    </SafeArea>
  );

  return fixed ? createPortal(tab, document.body) : tab;
};

const AppTabLink = ({ route }: { route: AppTabLink }) => {
  const Link = route.LinkComponent || WorkbenchLink;

  return (
    <Link
      className={styles.tabItem}
      to={route.to}
      key={route.to}
      replaceHistory
    >
      <TabItem id={route.key} label={route.to.slice(1)}>
        <route.Icon />
      </TabItem>
    </Link>
  );
};
