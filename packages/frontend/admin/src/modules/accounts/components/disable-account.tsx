import { TypeConfirmDialog } from '../../../components/shared/type-confirm-dialog';

export const DisableAccountDialog = ({
  email,
  open,
  onClose,
  onDisable,
  onOpenChange,
}: {
  email: string;
  open: boolean;
  onClose: () => void;
  onDisable: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <TypeConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Disable Account ?"
      description={
        <>
          The data associated with <span className="font-bold">{email}</span>{' '}
          will be deleted and cannot be used for logging in. This operation is
          irreversible. Please proceed with caution.
        </>
      }
      targetText={email}
      inputPlaceholder="Please type email to confirm"
      confirmText="Disable"
      confirmButtonVariant="destructive"
      onConfirm={onDisable}
      onClose={onClose}
    />
  );
};
