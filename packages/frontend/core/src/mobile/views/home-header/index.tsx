import {
  IconButton,
  Menu,
  SafeArea,
  startScopedViewTransition,
} from '@affine/component';
import { NotificationList } from '@affine/core/components/notification/list';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { NotificationCountService } from '@affine/core/modules/notification';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { NotificationIcon, SettingsIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SearchInput, WorkspaceSelector } from '../../components';
import { searchVTScope } from '../../components/search-input/style.css';
import * as styles from './styles.css';

/**
 * Contains `Setting`, `Workspace Selector`, `Search`
 * When scrolled:
 *   - combine Setting and Workspace Selector
 *   - hide Search
 */
export const HomeHeader = () => {
  const workspaceDialogService = useService(WorkspaceDialogService);

  const workspaceCardRef = useRef<HTMLDivElement>(null);
  const t = useI18n();
  const workbench = useService(WorkbenchService).workbench;
  const notificationCountService = useService(NotificationCountService);
  const notificationCount = useLiveData(notificationCountService.count$);
  const loggedIn = useLiveData(notificationCountService.loggedIn$);

  const navSearch = useCallback(() => {
    startScopedViewTransition(searchVTScope, () => {
      workbench.open('/search');
    });
  }, [workbench]);

  const [dense, setDense] = useState(false);

  useEffect(() => {
    const workspaceCard = workspaceCardRef.current;
    if (!workspaceCard) return;
    const observer = new IntersectionObserver(
      ([entry]) => setDense(!entry.isIntersecting),
      { threshold: 0.01 }
    );
    observer.observe(workspaceCard);
    return () => observer.disconnect();
  }, []);

  const openSetting = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'appearance',
    });
  }, [workspaceDialogService]);

  return (
    <>
      <SafeArea top className={styles.root}>
        <div className={styles.headerSettingRow} />
        <div className={styles.wsSelectorAndSearch}>
          <WorkspaceSelector ref={workspaceCardRef} />
          <SearchInput placeholder={t['Quick search']()} onClick={navSearch} />
        </div>
      </SafeArea>
      {/* float */}
      <SafeArea top className={clsx(styles.root, styles.float, { dense })}>
        <div className={styles.floatContent}>
          <WorkspaceSelector className={styles.floatWsSelector} />
          <Menu items={<NotificationList />}>
            <button
              type="button"
              aria-label={t['com.affine.rootAppSidebar.notifications']()}
              data-testid="notification-button"
              className={styles.headerAction}
              style={{
                position: 'relative',
                lineHeight: 0,
                color: cssVarV2.icon.primary,
                border: 0,
                background: 'none',
              }}
            >
              <NotificationIcon width={28} height={28} />
              {loggedIn && notificationCount > 0 && (
                <div
                  className={styles.notificationBadge}
                  style={{
                    fontSize: notificationCount > 99 ? '8px' : '12px',
                  }}
                >
                  {notificationCount > 99 ? '99+' : notificationCount}
                </div>
              )}
            </button>
          </Menu>
          <IconButton
            className={styles.headerAction}
            style={{ transition: 'none' }}
            onClick={openSetting}
            size={28}
            icon={<SettingsIcon />}
            data-testid="settings-button"
          />
        </div>
      </SafeArea>
    </>
  );
};
