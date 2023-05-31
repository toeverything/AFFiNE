import { IconButton, Tooltip } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SidebarIcon } from '@blocksuite/icons';
import { useAtom } from 'jotai';

import { sidebarButtonStyle } from '../index.css';
import { appSidebarOpenAtom } from '../index.jotai';

export const SidebarSwitch = () => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const t = useAFFiNEI18N();
  const tooltipContent = open ? t['Collapse sidebar']() : t['Expand sidebar']();
  const collapseKeyboardShortcuts =
    environment.isBrowser && environment.isMacOs ? ' ⌘+/' : ' Ctrl+/';

  return (
    <Tooltip
      content={tooltipContent + ' ' + collapseKeyboardShortcuts}
      placement="right"
      zIndex={1000}
    >
      <IconButton
        data-testid={`app-sidebar-arrow-button-${open ? 'collapse' : 'expand'}`}
        className={sidebarButtonStyle}
        onClick={() => setOpen(open => !open)}
      >
        <SidebarIcon width={24} height={24} />
      </IconButton>
    </Tooltip>
  );
};
