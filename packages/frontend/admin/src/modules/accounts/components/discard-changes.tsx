import { Button } from '@affine/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';

export const DiscardChanges = ({
  open,
  onClose,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[460px]">
        <DialogHeader>
          <DialogTitle className="leading-7">Discard Changes</DialogTitle>
          <DialogDescription className="leading-6">
            Changes to this user will not be saved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <div className="flex justify-end items-center w-full space-x-4">
            <Button type="button" onClick={onClose} variant="outline">
              <span>Cancel</span>
            </Button>
            <Button type="button" onClick={onConfirm} variant="destructive">
              <span>Discard</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
