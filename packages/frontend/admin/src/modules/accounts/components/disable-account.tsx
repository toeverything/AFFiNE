import { Button } from '@affine/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import { Input } from '@affine/admin/components/ui/input';
import { useCallback, useEffect, useState } from 'react';

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
  const [input, setInput] = useState('');
  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInput(event.target.value);
    },
    [setInput]
  );

  useEffect(() => {
    if (!open) {
      setInput('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Disable Account ?</DialogTitle>
          <DialogDescription>
            The data associated with <span className="font-bold">{email}</span>{' '}
            will be deleted and cannot be used for logging in. This operation is
            irreversible. Please proceed with caution.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="text"
          value={input}
          onChange={handleInput}
          placeholder="Please type email to confirm"
          className="placeholder:opacity-50 mt-4 h-9"
        />
        <DialogFooter className="mt-6">
          <div className="flex justify-end gap-2 items-center w-full">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onDisable}
              disabled={input !== email}
              size="sm"
              variant="destructive"
            >
              Disable
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
