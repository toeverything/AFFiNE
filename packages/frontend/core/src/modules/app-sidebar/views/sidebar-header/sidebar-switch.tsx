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
  const switchRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    appSidebarService.setHovering(true);
  }, [appSidebarService]);

  const handleClickSwitch = useCallback(() => {
    appSidebarService.toggleSidebar();
  }, [appSidebarService]);

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
        tooltipOptions={{ side: open ? 'bottom' : 'right' }}
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
