import { Button } from '@affine/admin/components/ui/button';
import { EditIcon, LinkIcon } from '@blocksuite/icons/rc';
import { useCallback, useState } from 'react';

import { DiscardChanges } from '../../../components/shared/discard-changes';
import { useRightPanel } from '../../panel/context';
import type { WorkspaceListItem } from '../schema';
import { WorkspacePanel } from './workspace-panel';
import { WorkspaceSharedLinksPanel } from './workspace-shared-links-panel';

export function DataTableRowActions({
  workspace,
}: {
  workspace: WorkspaceListItem;
}) {
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    'edit' | 'sharedLinks' | null
  >(null);
  const {
    setPanelContent,
    openPanel,
    isOpen,
    closePanel,
    hasDirtyChanges,
    setHasDirtyChanges,
  } = useRightPanel();

  const openWorkspacePanel = useCallback(() => {
    setHasDirtyChanges(false);
    setPanelContent(
      <WorkspacePanel workspaceId={workspace.id} onClose={closePanel} />
    );
    if (!isOpen) {
      openPanel();
    }
  }, [
    closePanel,
    isOpen,
    openPanel,
    setHasDirtyChanges,
    setPanelContent,
    workspace.id,
  ]);

  const openSharedLinksPanel = useCallback(() => {
    setHasDirtyChanges(false);
    setPanelContent(
      <WorkspaceSharedLinksPanel
        workspaceId={workspace.id}
        onClose={closePanel}
      />
    );
    if (!isOpen) {
      openPanel();
    }
  }, [
    closePanel,
    isOpen,
    openPanel,
    setHasDirtyChanges,
    setPanelContent,
    workspace.id,
  ]);

  const handleEdit = useCallback(() => {
    if (hasDirtyChanges) {
      setPendingAction('edit');
      setDiscardDialogOpen(true);
      return;
    }
    openWorkspacePanel();
  }, [hasDirtyChanges, openWorkspacePanel]);

  const handleSharedLinks = useCallback(() => {
    if (hasDirtyChanges) {
      setPendingAction('sharedLinks');
      setDiscardDialogOpen(true);
      return;
    }
    openSharedLinksPanel();
  }, [hasDirtyChanges, openSharedLinksPanel]);

  const handleDiscardConfirm = useCallback(() => {
    setDiscardDialogOpen(false);
    setHasDirtyChanges(false);
    if (pendingAction === 'sharedLinks') {
      openSharedLinksPanel();
    } else {
      openWorkspacePanel();
    }
    setPendingAction(null);
  }, [
    openSharedLinksPanel,
    openWorkspacePanel,
    pendingAction,
    setHasDirtyChanges,
  ]);

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="px-2 h-8 flex items-center gap-2"
          onClick={handleEdit}
        >
          <EditIcon fontSize={18} />
          <span>Edit</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 h-8 flex items-center gap-2"
          onClick={handleSharedLinks}
        >
          <LinkIcon fontSize={18} />
          <span>Shared links</span>
        </Button>
      </div>
      <DiscardChanges
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onClose={() => {
          setDiscardDialogOpen(false);
          setPendingAction(null);
        }}
        onConfirm={handleDiscardConfirm}
        description="Changes to this workspace will not be saved."
      />
    </>
  );
}
