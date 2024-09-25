import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { SidebarIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useRef } from 'react';

import { AppSidebarService } from '../../services/app-sidebar';
import * as styles from './sidebar-switch.css';

export const SidebarSwitch = ({
  show,
  enableOpenHoverSidebar,
  className,
}: {
  show: boolean;
  enableOpenHoverSidebar?: boolean;
  className?: string;
}) => {
  const appSidebarService = useService(AppSidebarService).sidebar;
  const open = useLiveData(appSidebarService.open$);
  const hoverFloating = useLiveData(appSidebarService.hoverFloating$);
  const switchRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (!enableOpenHoverSidebar || open) {
      return;
    }
    appSidebarService.setHoverFloating(true);
    appSidebarService.setOpen(true);
  }, [appSidebarService, enableOpenHoverSidebar, open]);

  const handleClickSwitch = useCallback(() => {
    if (open && hoverFloating) {
      appSidebarService.setShowFloatToPinAnimation(true);
      const timeout = setTimeout(() => {
        appSidebarService.setShowFloatToPinAnimation(false);
        appSidebarService.setHoverFloating(false);
      }, 500);
      return () => {
        clearTimeout(timeout);
      };
    }
    return appSidebarService.toggleSidebar();
  }, [appSidebarService, hoverFloating, open]);

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
      data-enable-open-hover-sidebar={enableOpenHoverSidebar}
      onMouseEnter={handleMouseEnter}
    >
      <IconButton
        tooltip={tooltipContent}
        tooltipShortcut={['$mod', '/']}
        tooltipOptions={{ side: open && !hoverFloating ? 'bottom' : 'right' }}
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
