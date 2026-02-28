import { Button } from '@affine/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[460px]">
        <DialogHeader>
          <DialogTitle className="leading-7">Enable Account</DialogTitle>
          <DialogDescription className="leading-6">
            Are you sure you want to enable the account? After enabling the
            account, the <span className="font-bold">{email}</span> email can be
            used to log in.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6">
          <div className="flex justify-end gap-2 items-center w-full">
            <Button type="button" onClick={onClose} variant="outline">
              <span>Cancel</span>
            </Button>
            <Button type="button" onClick={onConfirm} variant="default">
              <span>Enable</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
