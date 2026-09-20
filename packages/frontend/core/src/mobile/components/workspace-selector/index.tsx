import { MobileMenu } from '@affine/component';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { track } from '@affine/track';
import { useServiceOptional } from '@toeverything/infra';
import {
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { CurrentWorkspaceCard } from './current-card';
import { SelectorMenu } from './menu';

export const WorkspaceSelector = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function WorkspaceSelector({ className }, ref) {
  const [open, setOpen] = useState(false);
  const workspaceManager = useServiceOptional(WorkspacesService);

  const openMenu = useCallback(() => {
    track.$.navigationPanel.workspaceList.open();
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // revalidate workspace list when open workspace list
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(
      () => workspaceManager?.list.revalidate(),
      250
    );
    return () => window.clearTimeout(timer);
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
      <CurrentWorkspaceCard
        ref={ref}
        onClick={openMenu}
        className={className}
      />
    </MobileMenu>
  );
});
