import { GlobalCacheService } from '@affine/core/modules/storage';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { type PropsWithChildren, useCallback, useMemo } from 'react';

import { cacheKey } from './constants';
import { tabItem } from './styles.css';

export interface TabItemProps extends PropsWithChildren {
  id: string;
  label: string;
  onClick?: (isActive: boolean) => void;
}

export const TabItem = ({ id, label, children, onClick }: TabItemProps) => {
  const globalCache = useService(GlobalCacheService).globalCache;
  const activeTabId$ = useMemo(
    () => LiveData.from(globalCache.watch(cacheKey), 'home'),
    [globalCache]
  );
  const activeTabId = useLiveData(activeTabId$) ?? 'home';

  const isActive = id === activeTabId;

  const handleClick = useCallback(() => {
    globalCache.set(cacheKey, id);
    onClick?.(isActive);
  }, [globalCache, id, isActive, onClick]);

  return (
    <li
      className={tabItem}
      role="tab"
      aria-label={label}
      data-active={isActive}
      onClick={handleClick}
    >
      {children}
    </li>
  );
};
