import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { AllDocsIcon, SearchIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import type { Location } from 'react-router-dom';

import { HomeIcon } from './home-icon';
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
    Icon: HomeIcon,
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
    <ul className={styles.appTabs} id="app-tabs">
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
          >
            <li>
              <route.Icon />
            </li>
          </Link>
        );
      })}
    </ul>
  );
};
