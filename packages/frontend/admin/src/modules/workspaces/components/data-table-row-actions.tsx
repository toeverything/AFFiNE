import { Button } from '@affine/admin/components/ui/button';
import { EditIcon } from '@blocksuite/icons/rc';
import { useCallback, useState } from 'react';

import { DiscardChanges } from '../../../components/shared/discard-changes';
import { useRightPanel } from '../../panel/context';
import type { WorkspaceListItem } from '../schema';
import { WorkspacePanel } from './workspace-panel';

export function DataTableRowActions({
  workspace,
}: {
  workspace: WorkspaceListItem;
}) {
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const {
    setPanelContent,
    openPanel,
    isOpen,
    closePanel,
    hasDirtyChanges,
    setHasDirtyChanges,
  } = useRightPanel();

  const handleConfirm = useCallback(() => {
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

  const handleEdit = useCallback(() => {
    if (hasDirtyChanges) {
      setDiscardDialogOpen(true);
      return;
    }
    handleConfirm();
  }, [handleConfirm, hasDirtyChanges]);

  const handleDiscardConfirm = useCallback(() => {
    setDiscardDialogOpen(false);
    setHasDirtyChanges(false);
    handleConfirm();
  }, [handleConfirm, setHasDirtyChanges]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="px-2 h-8 flex items-center gap-2"
        onClick={handleEdit}
      >
        <EditIcon fontSize={18} />
        <span>Edit</span>
      </Button>
      <DiscardChanges
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onClose={() => setDiscardDialogOpen(false)}
        onConfirm={handleDiscardConfirm}
        description="Changes to this workspace will not be saved."
      />
    </>
  );
}
