import { Button } from '@affine/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';

import type { ModifiedValues } from './index';

export const ConfirmChanges = ({
  open,
  onClose,
  onConfirm,
  onOpenChange,
  modifiedValues,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  modifiedValues: ModifiedValues[];
}) => {
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
        {modifiedValues.length > 0 ? (
          <pre className="flex flex-col text-sm bg-zinc-100 gap-1 min-h-[64px] rounded-md p-[12px_16px_16px_12px] mt-2 overflow-hidden">
            <p>{'{'}</p>
            {modifiedValues.map(({ id, expiredValue, newValue }) => (
              <p key={id}>
                {'  '} {id}:{' '}
                <span
                  className="mr-2 line-through "
                  style={{
                    color: 'rgba(198, 34, 34, 1)',
                    backgroundColor: 'rgba(254, 213, 213, 1)',
                  }}
                >
                  {JSON.stringify(expiredValue)}
                </span>
                <span
                  style={{
                    color: 'rgba(20, 147, 67, 1)',
                    backgroundColor: 'rgba(225, 250, 177, 1)',
                  }}
                >
                  {JSON.stringify(newValue)}
                </span>
                ,
              </p>
            ))}
            <p>{'}'}</p>
          </pre>
        ) : (
          'There is no change.'
        )}
        <DialogFooter>
          <div className="flex justify-end items-center w-full space-x-4">
            <Button type="button" onClick={onClose} variant="outline">
              <span>Cancel</span>
            </Button>
            <Button type="button" onClick={onConfirm}>
              <span>Save</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
