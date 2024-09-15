import { SafeArea } from '@affine/component';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { AllDocsIcon, MobileHomeIcon, SearchIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import type { Location } from 'react-router-dom';

import * as styles from './styles.css';

interface Route {
  to: string;
  Icon: React.FC;
  LinkComponent?: React.FC;
  isActive?: (location: Location) => boolean;
}

const routes: Route[] = [
  {
    to: '/home',
    Icon: MobileHomeIcon,
  },
  {
    to: '/all',
    Icon: AllDocsIcon,
    isActive: location =>
      location.pathname === '/all' ||
      location.pathname.startsWith('/collection') ||
      location.pathname.startsWith('/tag'),
  },
  {
    to: '/search',
    Icon: SearchIcon,
  },
];

export const AppTabs = () => {
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);

  return (
    <SafeArea bottom className={styles.appTabs} bottomOffset={2}>
      <ul className={styles.appTabsInner} id="app-tabs" role="tablist">
        {routes.map(route => {
          const Link = route.LinkComponent || WorkbenchLink;

          const isActive = route.isActive
            ? route.isActive(location)
            : location.pathname === route.to;
          return (
            <Link
              data-active={isActive}
              to={route.to}
              key={route.to}
              className={styles.tabItem}
              role="tab"
              aria-label={route.to.slice(1)}
              replaceHistory
            >
              <li style={{ lineHeight: 0 }}>
                <route.Icon />
              </li>
            </Link>
          );
        })}
      </ul>
    </SafeArea>
  );
};
