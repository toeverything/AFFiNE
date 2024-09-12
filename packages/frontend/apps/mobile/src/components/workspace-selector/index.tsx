import { MobileMenu } from '@affine/component';
import { track } from '@affine/core/mixpanel';
import { useService, WorkspacesService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { CurrentWorkspaceCard } from './current-card';
import { SelectorMenu } from './menu';

export const WorkspaceSelector = () => {
  const [open, setOpen] = useState(false);
  const workspaceManager = useService(WorkspacesService);

  const openMenu = useCallback(() => {
    track.$.navigationPanel.workspaceList.open();
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // revalidate workspace list when open workspace list
  useEffect(() => {
    if (open) workspaceManager.list.revalidate();
  }, [workspaceManager, open]);

  return (
    <MobileMenu
      items={<SelectorMenu onClose={close} />}
      rootOptions={{ open }}
      contentOptions={{
        onInteractOutside: close,
        onEscapeKeyDown: close,
        style: { padding: 0 },
      }}
    >
      <CurrentWorkspaceCard onClick={openMenu} />
    </MobileMenu>
  );
};
