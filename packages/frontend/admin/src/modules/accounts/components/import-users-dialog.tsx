import { Button } from '@affine/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  downloadCsvTemplate,
  exportImportResults,
  getValidUsersToImport,
  ImportStatus,
  type ParsedUser,
  processCSVFile,
} from '../utils/csv-utils';
import { FileUploadArea, type FileUploadAreaRef } from './file-upload-area';
import {
  useImportUsers,
  type UserImportReturnType,
} from './use-user-management';
import { UserTable } from './user-table';

interface ImportUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportUsersDialog({
  open,
  onOpenChange,
}: ImportUsersDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isFormatError, setIsFormatError] = useState(false);
  const importUsers = useImportUsers();
  const fileUploadRef = useRef<FileUploadAreaRef>(null);

  const handleUpload = useCallback(
    () => fileUploadRef.current?.triggerFileUpload(),
    []
  );

  // Reset all states when dialog is closed
  useEffect(() => {
    if (open) {
      setIsPreviewMode(false);
      setParsedUsers([]);
      setIsImporting(false);
      setIsFormatError(false);
    }
  }, [open]);

  const importUsersCallback = useCallback(
    (result: UserImportReturnType) => {
      const successfulUsers = result.filter(
        (user): user is Extract<typeof user, { __typename: 'UserType' }> =>
          user.__typename === 'UserType'
      );

      const failedUsers = result.filter(
        (
          user
        ): user is Extract<
          typeof user,
          { __typename: 'UserImportFailedType' }
        > => user.__typename === 'UserImportFailedType'
      );

      const successCount = successfulUsers.length;
      const failedCount = parsedUsers.length - successCount;

      if (failedCount > 0) {
        toast.info(
          `Successfully imported ${successCount} users, ${failedCount} failed`
        );
      } else {
        toast.success(`Successfully imported ${successCount} users`);
      }

      const successfulUserEmails = new Set(
        successfulUsers.map(user => user.email)
      );

      const failedUserErrorMap = new Map(
        failedUsers.map(user => [user.email, user.error])
      );

      setParsedUsers(prev => {
        return prev.map(user => {
          if (successfulUserEmails.has(user.email)) {
            return {
              ...user,
              importStatus: ImportStatus.Success,
            };
          }

          const errorMessage = failedUserErrorMap.get(user.email) || user.error;
          return {
            ...user,
            importStatus: ImportStatus.Failed,
            importError: errorMessage,
          };
        });
      });

      setIsImporting(false);
    },
    [parsedUsers.length, setIsImporting]
  );

  const handleFileSelected = useCallback(async (file: File) => {
    setIsImporting(true);
    try {
      await processCSVFile(
        file,
        validatedUsers => {
          setParsedUsers(validatedUsers);
          setIsPreviewMode(true);
          setIsImporting(false);
        },
        () => {
          setIsImporting(false);
          setIsFormatError(true);
        }
      );
    } catch (error) {
      console.error('Failed to process file', error);
      setIsImporting(false);
      setIsFormatError(true);
    }
  }, []);

  const confirmImport = useAsyncCallback(async () => {
    setIsImporting(true);
    try {
      const validUsersToImport = getValidUsersToImport(parsedUsers);

      setParsedUsers(prev =>
        prev.map(user =>
          user.valid ? { ...user, importStatus: ImportStatus.Processing } : user
        )
      );

      await importUsers({ users: validUsersToImport }, importUsersCallback);
      // Note: setIsImporting(false) is now handled in importUsersCallback
    } catch (error) {
      console.error('Failed to import users', error);
      toast.error('Failed to import users');
      setIsImporting(false);
    }
  }, [importUsers, importUsersCallback, parsedUsers]);

  const cancelImport = useCallback(() => {
    setIsPreviewMode(false);
    setParsedUsers([]);
  }, []);

  const resetFormatError = useCallback(() => {
    setIsFormatError(false);
  }, []);

  // Handle closing the dialog after import is complete
  const handleDone = useCallback(() => {
    // Reset all states and close the dialog
    setIsPreviewMode(false);
    setParsedUsers([]);
    setIsImporting(false);
    setIsFormatError(false);
    onOpenChange(false);
  }, [onOpenChange]);

  // Export failed imports to CSV
  const exportResult = useCallback(() => {
    exportImportResults(parsedUsers);
  }, [parsedUsers]);

  const isImported = useMemo(() => {
    return parsedUsers.some(
      user => user.importStatus && user.importStatus !== ImportStatus.Processing
    );
  }, [parsedUsers]);

  const handleConfirm = useCallback(() => {
    if (isImported) {
      exportResult();
      handleDone();
    } else {
      confirmImport();
    }
  }, [confirmImport, exportResult, handleDone, isImported]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isPreviewMode ? 'sm:max-w-[600px] flex-col' : 'sm:max-w-[425px]'
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
        <DialogDescription className="text-[15px] mt-3">
          {isFormatError ? (
            'You need to import the accounts by importing a CSV file in the correct format. Please download the CSV template.'
          ) : isPreviewMode ? (
            <div className="grid gap-3">
              {isImported ? null : (
                <p>
                  {parsedUsers.length} users detected from the CSV file. Please
                  confirm the user list below and import.
                </p>
              )}
              <UserTable users={parsedUsers} />
            </div>
          ) : (
            <div className="grid gap-3">
              <p>
                You need to import the accounts by importing a CSV file in the
                correct format. Please download the CSV template.
              </p>
              <FileUploadArea
                ref={fileUploadRef}
                onFileSelected={handleFileSelected}
              />
            </div>
          )}
        </DialogDescription>

        <DialogFooter
          className={`flex-col mt-6 sm:flex-row sm:justify-between items-center ${isPreviewMode ? 'sm:justify-end' : 'sm:justify-between'}`}
        >
          {isFormatError ? (
            <>
              <div
                onClick={downloadCsvTemplate}
                className="mb-2 sm:mb-0 text-[15px] px-0 py-2 h-10 underline cursor-pointer"
              >
                CSV template
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={resetFormatError}
                className="w-full sm:w-auto text-[15px] px-4 py-2 h-10"
              >
                Done
              </Button>
            </>
          ) : isPreviewMode ? (
            <>
              <Button
                variant="outline"
                onClick={cancelImport}
                className="w-full mb-2 sm:mb-0 sm:w-auto"
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                className="w-full sm:w-auto text-[15px] px-4 py-2 h-10"
                disabled={
                  isImporting ||
                  parsedUsers.some(
                    user => user.importStatus === ImportStatus.Processing
                  )
                }
              >
                {isImporting
                  ? 'Importing...'
                  : isImported
                    ? 'Export'
                    : 'Confirm Import'}
              </Button>
            </>
          ) : (
            <>
              <div
                onClick={downloadCsvTemplate}
                className="mb-2 sm:mb-0 underline text-[15px] cursor-pointer"
              >
                CSV template
              </div>
              <Button
                type="button"
                onClick={handleUpload}
                className="w-full sm:w-auto text-[15px] px-4 py-2 h-10"
                disabled={isImporting}
              >
                {isImporting ? 'Parsing...' : 'Choose a file'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
