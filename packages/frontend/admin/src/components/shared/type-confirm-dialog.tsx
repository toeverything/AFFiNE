import { Button, type ButtonProps } from '@affine/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import { Input } from '@affine/admin/components/ui/input';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

interface TypeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  targetText: string;
  inputPlaceholder?: string;
  cancelText?: string;
  confirmText?: string;
  confirmButtonVariant?: ButtonProps['variant'];
  onConfirm: () => void;
  onClose?: () => void;
}

export const TypeConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  targetText,
  inputPlaceholder = 'Please type to confirm',
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  confirmButtonVariant = 'destructive',
  onConfirm,
  onClose,
}: TypeConfirmDialogProps) => {
  const [input, setInput] = useState('');

  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInput(event.target.value);
    },
    []
  );

  useEffect(() => {
    if (!open) {
      setInput('');
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          type="text"
          value={input}
          onChange={handleInput}
          placeholder={inputPlaceholder}
          className="placeholder:opacity-50 mt-4 h-9"
        />
        <DialogFooter className="mt-6">
          <div className="flex justify-end gap-2 items-center w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={input !== targetText}
              size="sm"
              variant={confirmButtonVariant}
            >
              {confirmText}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
