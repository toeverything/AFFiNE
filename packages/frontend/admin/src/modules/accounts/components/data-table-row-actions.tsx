import { Button } from '@affine/admin/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@affine/admin/components/ui/dropdown-menu';
import {
  AccountBanIcon,
  DeleteIcon,
  EditIcon,
  LockIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons/rc';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { DiscardChanges } from '../../../components/shared/discard-changes';
import { useRightPanel } from '../../panel/context';
import type { UserType } from '../schema';
import { DeleteAccountDialog } from './delete-account';
import { DisableAccountDialog } from './disable-account';
import { EnableAccountDialog } from './enable-account';
import { ResetPasswordDialog } from './reset-password';
import {
  useDeleteUser,
  useDisableUser,
  useEnableUser,
  useResetUserPassword,
} from './use-user-management';
import { UpdateUserForm } from './user-form';

interface DataTableRowActionsProps {
  user: UserType;
}

export function DataTableRowActions({ user }: DataTableRowActionsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const {
    openPanel,
    isOpen,
    closePanel,
    setPanelContent,
    hasDirtyChanges,
    setHasDirtyChanges,
  } = useRightPanel();

  const deleteUser = useDeleteUser();
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  const { resetPasswordLink, onResetPassword } = useResetUserPassword();

  const openResetPasswordDialog = useCallback(() => {
    onResetPassword(user.id, () => setResetPasswordDialogOpen(true)).catch(
      e => {
        console.error(e);
      }
    );
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

  const handleDeleting = useCallback(() => {
    if (isOpen) {
      closePanel();
    }
    setDeleteDialogOpen(false);
  }, [closePanel, isOpen]);
  const handleDisabling = useCallback(() => {
    if (isOpen) {
      closePanel();
    }
    setDisableDialogOpen(false);
  }, [closePanel, isOpen]);
  const handleEnabling = useCallback(() => {
    if (isOpen) {
      closePanel();
    }
    setEnableDialogOpen(false);
  }, [closePanel, isOpen]);

  const handleDelete = useCallback(() => {
    deleteUser(user.id, handleDeleting);
  }, [deleteUser, handleDeleting, user.id]);
  const handleDisable = useCallback(() => {
    disableUser(user.id, handleDisabling);
  }, [disableUser, handleDisabling, user.id]);
  const handleEnable = useCallback(() => {
    enableUser(user.id, handleEnabling);
  }, [enableUser, handleEnabling, user.id]);

  const openDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);
  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
  }, []);

  const openDisableDialog = useCallback(() => {
    setDisableDialogOpen(true);
  }, []);
  const closeDisableDialog = useCallback(() => {
    setDisableDialogOpen(false);
  }, []);

  const openEnableDialog = useCallback(() => {
    setEnableDialogOpen(true);
  }, []);
  const closeEnableDialog = useCallback(() => {
    setEnableDialogOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    setHasDirtyChanges(false);
    setPanelContent(
      <UpdateUserForm
        user={user}
        onComplete={closePanel}
        onResetPassword={openResetPasswordDialog}
        onDeleteAccount={openDeleteDialog}
        onDirtyChange={setHasDirtyChanges}
      />
    );
    openPanel();
  }, [
    closePanel,
    openDeleteDialog,
    openPanel,
    openResetPasswordDialog,
    setPanelContent,
    user,
    setHasDirtyChanges,
  ]);

  const handleEdit = useCallback(() => {
    if (hasDirtyChanges) {
      setDiscardDialogOpen(true);
      return;
    }
    setHasDirtyChanges(false);
    handleConfirm();
  }, [handleConfirm, hasDirtyChanges, setHasDirtyChanges]);

  const handleDiscardConfirm = useCallback(() => {
    setDiscardDialogOpen(false);
    setHasDirtyChanges(false);
    handleConfirm();
  }, [handleConfirm, setHasDirtyChanges]);

  return (
    <div className="flex justify-end items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <MoreHorizontalIcon fontSize={20} />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[214px] p-[5px] gap-2">
          <DropdownMenuItem
            onSelect={handleEdit}
            className="px-2 py-[6px] text-sm font-normal gap-2 cursor-pointer"
          >
            <EditIcon fontSize={20} />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="px-2 py-[6px] text-sm font-normal gap-2 cursor-pointer"
            onSelect={openResetPasswordDialog}
          >
            <LockIcon fontSize={20} />
            {user.hasPassword ? 'Reset Password' : 'Setup Account'}
          </DropdownMenuItem>
          {user.disabled && (
            <DropdownMenuItem
              className="px-2 py-[6px] text-sm font-normal gap-2 cursor-pointer"
              onSelect={openEnableDialog}
            >
              <AccountBanIcon fontSize={20} />
              Enable Email
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {!user.disabled && (
            <DropdownMenuItem
              className="px-2 py-[6px] text-sm font-normal gap-2 text-red-500 cursor-pointer focus:text-red-500"
              onSelect={openDisableDialog}
            >
              <AccountBanIcon fontSize={20} />
              Disable & Delete data
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="px-2 py-[6px] text-sm font-normal gap-2 text-red-500 cursor-pointer focus:text-red-500"
            onSelect={openDeleteDialog}
          >
            <DeleteIcon fontSize={20} />
            Delete
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
      <DisableAccountDialog
        email={user.email}
        open={disableDialogOpen}
        onClose={closeDisableDialog}
        onOpenChange={setDisableDialogOpen}
        onDisable={handleDisable}
      />
      <EnableAccountDialog
        email={user.email}
        open={enableDialogOpen}
        onClose={closeEnableDialog}
        onOpenChange={setEnableDialogOpen}
        onConfirm={handleEnable}
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
        onClose={() => setDiscardDialogOpen(false)}
        onConfirm={handleDiscardConfirm}
      />
    </div>
  );
}
