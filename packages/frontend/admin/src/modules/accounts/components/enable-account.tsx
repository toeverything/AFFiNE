import { ConfirmDialog } from '../../../components/shared/confirm-dialog';

export const EnableAccountDialog = ({
  open,
  email,
  onClose,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Enable Account"
      description={
        <>
          Are you sure you want to enable the account? After enabling the
          account, the <span className="font-bold">{email}</span> email can be
          used to log in.
        </>
      }
      confirmText="Enable"
      confirmButtonVariant="default"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
};
