import { IconButton, Tooltip } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { SidebarIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
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
  const collapseKeyboardShortcuts =
    environment.isBrowser && environment.isMacOs ? ' ⌘+/' : ' Ctrl+/';

  return (
    <Tooltip
      content={tooltipContent + ' ' + collapseKeyboardShortcuts}
      side={open ? 'bottom' : 'right'}
    >
      <IconButton
        className={clsx(styles.sidebarSwitch, className)}
        data-show={show}
        size="large"
        data-testid={`app-sidebar-arrow-button-${open ? 'collapse' : 'expand'}`}
        style={{
          zIndex: 1,
        }}
        onClick={() => setOpen(open => !open)}
      >
        <SidebarIcon />
      </IconButton>
    </Tooltip>
  );
};
