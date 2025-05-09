import { Button } from '@affine/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import { useCallback } from 'react';

import type { AppConfig } from './config';

export const ConfirmChanges = ({
  updates,
  open,
  onOpenChange,
  onConfirm,
}: {
  updates: AppConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => {
  const onClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const modifiedKeys = Object.keys(updates).filter(
    key => updates[key].from !== updates[key].to
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[460px]">
        <DialogHeader>
          <DialogTitle className="leading-7">
            Save Runtime Configurations ?
          </DialogTitle>
          <DialogDescription className="leading-6">
            Are you sure you want to save the following changes?
          </DialogDescription>
        </DialogHeader>
        {modifiedKeys.length > 0 ? (
          <pre className="flex flex-col text-sm bg-zinc-100 gap-1 min-h-[64px] rounded-md p-[12px_16px_16px_12px] mt-2 overflow-auto">
            <p>{'{'}</p>
            {modifiedKeys.map(key => (
              <p key={key}>
                {'  '} {key}:{' '}
                <span
                  className="mr-2 line-through "
                  style={{
                    color: 'rgba(198, 34, 34, 1)',
                    backgroundColor: 'rgba(254, 213, 213, 1)',
                  }}
                >
                  {JSON.stringify(updates[key].from)}
                </span>
                <span
                  style={{
                    color: 'rgba(20, 147, 67, 1)',
                    backgroundColor: 'rgba(225, 250, 177, 1)',
                  }}
                >
                  {JSON.stringify(updates[key].to)}
                </span>
                ,
              </p>
            ))}
            <p>{'}'}</p>
          </pre>
        ) : (
          'There is no change.'
        )}
        <DialogFooter className="mt-6">
          <div className="flex justify-end items-center w-full gap-2">
            <Button type="button" onClick={onClose} variant="outline">
              <span>Cancel</span>
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={modifiedKeys.length === 0}
            >
              <span>Save</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
