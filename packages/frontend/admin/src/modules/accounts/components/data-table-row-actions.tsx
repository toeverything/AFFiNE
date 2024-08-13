import { Button } from '@affine/admin/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@affine/admin/components/ui/dropdown-menu';
import type { Row } from '@tanstack/react-table';
import {
  LockIcon,
  MoreVerticalIcon,
  SettingsIcon,
  TrashIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useRightPanel } from '../../layout';
import { userSchema } from '../schema';
import { DeleteAccountDialog } from './delete-account';
import { DiscardChanges } from './discard-changes';
import { EditPanel } from './edit-panel';
import { ResetPasswordDialog } from './reset-password';
import { useUserManagement } from './use-user-management';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const user = userSchema.parse(row.original);
  const { setRightPanelContent, openPanel, isOpen, closePanel } =
    useRightPanel();

  const { deleteUser, resetPasswordLink, onResetPassword } =
    useUserManagement();

  const openResetPasswordDialog = useCallback(() => {
    onResetPassword(user.id, () => setResetPasswordDialogOpen(true));
  }, [onResetPassword, user.id]);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(resetPasswordLink)
      .then(() => {
        toast('Reset password link copied to clipboard');
        setResetPasswordDialogOpen(false);
      })
      .catch(e => {
        toast.error('Failed to copy reset password link: ' + e.message);
      });
  }, [resetPasswordLink]);

  const onDeleting = useCallback(() => {
    if (isOpen) {
      closePanel();
    }
    setDeleteDialogOpen(false);
  }, [closePanel, isOpen]);

  const handleDelete = useCallback(() => {
    deleteUser(user.id, onDeleting);
  }, [deleteUser, onDeleting, user.id]);

  const openDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
  }, []);

  const handleDiscardChangesCancel = useCallback(() => {
    setDiscardDialogOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    setRightPanelContent(
      <EditPanel
        user={user}
        onResetPassword={openResetPasswordDialog}
        onDeleteAccount={openDeleteDialog}
      />
    );
    if (discardDialogOpen) {
      handleDiscardChangesCancel();
    }

    if (!isOpen) {
      openPanel();
    }
  }, [
    discardDialogOpen,
    handleDiscardChangesCancel,
    isOpen,
    openDeleteDialog,
    openPanel,
    openResetPasswordDialog,
    setRightPanelContent,
    user,
  ]);

  const handleEdit = useCallback(() => {
    if (isOpen) {
      setDiscardDialogOpen(true);
    } else {
      handleConfirm();
    }
  }, [handleConfirm, isOpen]);

  return (
    <div className="flex justify-end items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <MoreVerticalIcon size={20} />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[214px] p-[5px] gap-2">
          <div className="px-2 py-[6px] text-sm font-semibold overflow-hidden text-ellipsis text-nowrap">
            {user.name}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="px-2 py-[6px] text-sm font-medium gap-2 cursor-pointer"
            onSelect={openResetPasswordDialog}
          >
            <LockIcon size={16} /> Reset Password
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleEdit}
            className="px-2 py-[6px] text-sm font-medium gap-2 cursor-pointer"
          >
            <SettingsIcon size={16} /> Edit
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="px-2 py-[6px] text-sm font-medium gap-2 text-red-500 cursor-pointer focus:text-red-500"
            onSelect={openDeleteDialog}
          >
            <TrashIcon size={16} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog
        email={user.email}
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onOpenChange={setDeleteDialogOpen}
        onDelete={handleDelete}
      />
      <ResetPasswordDialog
        link={resetPasswordLink}
        open={resetPasswordDialogOpen}
        onOpenChange={setResetPasswordDialogOpen}
        onCopy={handleCopy}
      />
      <DiscardChanges
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onClose={handleDiscardChangesCancel}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
