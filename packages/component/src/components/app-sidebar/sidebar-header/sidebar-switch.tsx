import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SidebarIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useAtom } from 'jotai';
import { useRef } from 'react';

import { appSidebarOpenAtom } from '../index.jotai';

export const SidebarSwitch = () => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const t = useAFFiNEI18N();
  const ref = useRef(null);
  const tooltipContent = open ? t['Collapse sidebar']() : t['Expand sidebar']();
  const collapseKeyboardShortcuts =
    environment.isBrowser && environment.isMacOs ? ' ⌘+/' : ' Ctrl+/';

  return (
    <Tooltip
      content={tooltipContent + ' ' + collapseKeyboardShortcuts}
      side="right"
      portalOptions={{
        container: ref.current,
      }}
    >
      <IconButton
        size="large"
        data-testid={`app-sidebar-arrow-button-${open ? 'collapse' : 'expand'}`}
        style={{
          zIndex: 1,
        }}
        onClick={() => setOpen(open => !open)}
        ref={ref}
      >
        <SidebarIcon />
      </IconButton>
    </Tooltip>
  );
};
