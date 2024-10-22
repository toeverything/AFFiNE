import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { SidebarIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useRef } from 'react';

import { AppSidebarService } from '../../services/app-sidebar';
import * as styles from './sidebar-switch.css';

export const SidebarSwitch = ({
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) => {
  const appSidebarService = useService(AppSidebarService).sidebar;
  const open = useLiveData(appSidebarService.open$);
  const preventHovering = useLiveData(appSidebarService.preventHovering$);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const handleMouseEnter = useCallback(() => {
    if (preventHovering || open) {
      return;
    }
    appSidebarService.setHovering(true);
  }, [appSidebarService, open, preventHovering]);

  const handleClickSwitch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (open) {
      appSidebarService.setHovering(false);
      timeoutRef.current = setTimeout(() => {
        appSidebarService.setPreventHovering(false);
      }, 500);
    }

    appSidebarService.setPreventHovering(true);
    appSidebarService.toggleSidebar();
  }, [appSidebarService, open]);

  const t = useI18n();
  const tooltipContent = open
    ? t['com.affine.sidebarSwitch.collapse']()
    : t['com.affine.sidebarSwitch.expand']();

  return (
    <div
      ref={switchRef}
      data-show={show}
      className={styles.sidebarSwitchClip}
      data-testid={`app-sidebar-arrow-button-${open ? 'collapse' : 'expand'}`}
      onMouseEnter={handleMouseEnter}
    >
      <IconButton
        tooltip={tooltipContent}
        tooltipShortcut={['$mod', '/']}
        tooltipOptions={{
          side: open ? 'bottom' : 'right',
          rootOptions: { delayDuration: 700 },
        }}
        className={className}
        size="24"
        style={{
          zIndex: 1,
        }}
        onClick={handleClickSwitch}
      >
        <SidebarIcon />
      </IconButton>
    </div>
  );
};
