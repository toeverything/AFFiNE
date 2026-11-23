import { Button } from '@affine/admin/components/ui/button';
import { Checkbox } from '@affine/admin/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import { Label } from '@affine/admin/components/ui/label';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { CopyIcon } from '@blocksuite/icons/rc';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { UserType } from '../schema';
import { type ExportField, useExportUsers } from './use-user-management';

interface ExportUsersDialogProps {
  users: UserType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportUsersDialog({
  users,
  open,
  onOpenChange,
}: ExportUsersDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [fields, setFields] = useState<ExportField[]>([
    {
      id: 'name',
      label: 'Username',
      checked: true,
    },
    {
      id: 'email',
      label: 'Email',
      checked: true,
    },
  ]);

  const handleFieldChange = useCallback(
    (id: string, checked: boolean) => {
      setFields(
        fields.map(field => (field.id === id ? { ...field, checked } : field))
      );
    },
    [fields]
  );

  const { exportCSV, copyToClipboard } = useExportUsers();

  const handleExport = useAsyncCallback(async () => {
    setIsExporting(true);
    try {
      await exportCSV(users, fields, () => {
        setIsExporting(false);
        onOpenChange(false);
        toast('Users exported successfully');
      });
    } catch (error) {
      console.error('Failed to export users', error);
      toast.error('Failed to export users');
      setIsExporting(false);
    }
  }, [exportCSV, fields, onOpenChange, users]);

  const handleCopy = useAsyncCallback(async () => {
    setIsCopying(true);
    try {
      await copyToClipboard(users, fields, () => {
        setIsCopying(false);
        onOpenChange(false);
        toast('Users copied successfully');
      });
    } catch (error) {
      console.error('Failed to copy users', error);
      toast.error('Failed to copy users');
      setIsCopying(false);
    }
  }, [copyToClipboard, fields, onOpenChange, users]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {fields.map(field => (
            <div key={field.id} className="flex items-center space-x-2">
              <Checkbox
                id={`export-${field.id}`}
                checked={field.checked}
                onCheckedChange={checked =>
                  handleFieldChange(field.id, !!checked)
                }
              />
              <Label htmlFor={`export-${field.id}`}>{field.label}</Label>
            </div>
          ))}
        </div>

        <DialogFooter className="mt-6">
          <Button
            type="button"
            onClick={handleExport}
            className="w-full text-[15px] px-4 py-2 h-10"
            disabled={isExporting || isCopying}
          >
            {isExporting ? 'Exporting...' : 'Download account information'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="p-5"
            onClick={handleCopy}
            disabled={isExporting || isCopying}
          >
            <CopyIcon fontSize={20} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
