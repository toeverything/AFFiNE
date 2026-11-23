import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import { useEffect, useRef } from 'react';

import { useServerConfig } from '../../../common';
import type { FileUploadAreaRef } from './file-upload-area';
import {
  ImportErrorContent,
  ImportInitialContent,
  ImportPreviewContent,
} from './import-content';
import { ImportUsersFooter } from './import-footer';
import { useImportUsersState } from './use-import-users-state';

export interface ImportUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog for importing users from a CSV file
 */
export function ImportUsersDialog({
  open,
  onOpenChange,
}: ImportUsersDialogProps) {
  const fileUploadRef = useRef<FileUploadAreaRef>(null);
  const serverConfig = useServerConfig();
  const passwordLimits = serverConfig.credentialsRequirement.password;

  const handleUpload = () => fileUploadRef.current?.triggerFileUpload();

  const {
    isImporting,
    parsedUsers,
    isPreviewMode,
    isFormatError,
    isImported,
    handleFileSelected,
    cancelImport,
    resetFormatError,
    handleConfirm,
    resetState,
  } = useImportUsersState({
    passwordLimits,
    onClose: () => onOpenChange(false),
  });

  // Reset all states when dialog is opened
  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open, resetState]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isPreviewMode ? 'sm:max-w-[720px] flex-col' : 'sm:max-w-[480px]'
        }
      >
        <DialogHeader>
          <DialogTitle>
            {isFormatError
              ? 'Incorrect import format'
              : isPreviewMode
                ? isImported
                  ? 'Import results'
                  : 'Confirm import'
                : 'Import'}
          </DialogTitle>
        </DialogHeader>
        <div className="text-[15px] mt-3">
          {isFormatError ? (
            <ImportErrorContent />
          ) : isPreviewMode ? (
            <ImportPreviewContent
              parsedUsers={parsedUsers}
              isImported={isImported}
            />
          ) : (
            <ImportInitialContent
              passwordLimits={passwordLimits}
              fileUploadRef={fileUploadRef}
              onFileSelected={handleFileSelected}
            />
          )}
        </div>

        <ImportUsersFooter
          isFormatError={isFormatError}
          isPreviewMode={isPreviewMode}
          isImporting={isImporting}
          isImported={isImported}
          resetFormatError={resetFormatError}
          cancelImport={cancelImport}
          handleConfirm={handleConfirm}
          handleUpload={handleUpload}
          parsedUsers={parsedUsers}
        />
      </DialogContent>
    </Dialog>
  );
}
