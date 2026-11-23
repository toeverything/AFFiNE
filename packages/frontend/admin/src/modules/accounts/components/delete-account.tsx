import { TypeConfirmDialog } from '../../../components/shared/type-confirm-dialog';

export const DeleteAccountDialog = ({
  email,
  open,
  onClose,
  onDelete,
  onOpenChange,
}: {
  email: string;
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <TypeConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Account ?"
      description={
        <>
          <span className="font-bold">{email}</span> will be permanently
          deleted. This operation is irreversible. Please proceed with caution.
        </>
      }
      targetText={email}
      inputPlaceholder="Please type email to confirm"
      confirmText="Delete"
      confirmButtonVariant="destructive"
      onConfirm={onDelete}
      onClose={onClose}
    />
  );
};
