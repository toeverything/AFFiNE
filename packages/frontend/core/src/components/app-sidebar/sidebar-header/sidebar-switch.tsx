import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { SidebarIcon } from '@blocksuite/icons/rc';
import { useAtom } from 'jotai';

import { appSidebarOpenAtom } from '../index.jotai';
import * as styles from './sidebar-switch.css';

export const SidebarSwitch = ({
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const t = useI18n();
  const tooltipContent = open
    ? t['com.affine.sidebarSwitch.collapse']()
    : t['com.affine.sidebarSwitch.expand']();

  return (
    <div
      data-show={show}
      className={styles.sidebarSwitchClip}
      data-testid={`app-sidebar-arrow-button-${open ? 'collapse' : 'expand'}`}
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
        onClick={() => setOpen(open => !open)}
      >
        <SidebarIcon />
      </IconButton>
    </div>
  );
};
