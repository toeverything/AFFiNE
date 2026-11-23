import { ConfirmDialog } from './confirm-dialog';

export const DiscardChanges = ({
  open,
  onClose,
  onConfirm,
  onOpenChange,
  description = 'Changes will not be saved.',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  description?: string;
}) => {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Discard Changes"
      description={description}
      confirmText="Discard"
      confirmButtonVariant="destructive"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
};
