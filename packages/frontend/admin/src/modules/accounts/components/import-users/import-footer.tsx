import { Button } from '@affine/admin/components/ui/button';
import { DialogFooter } from '@affine/admin/components/ui/dialog';
import type { FC } from 'react';

import { downloadCsvTemplate, ImportStatus } from '../../utils/csv-utils';

interface ImportUsersFooterProps {
  isFormatError: boolean;
  isPreviewMode: boolean;
  isImporting: boolean;
  isImported: boolean;
  resetFormatError: () => void;
  cancelImport: () => void;
  handleConfirm: () => void;
  handleUpload: () => void;
  parsedUsers: {
    importStatus?: ImportStatus;
  }[];
}

/**
 * Component for the dialog footer with appropriate buttons based on the import state
 */
export const ImportUsersFooter: FC<ImportUsersFooterProps> = ({
  isFormatError,
  isPreviewMode,
  isImporting,
  isImported,
  resetFormatError,
  cancelImport,
  handleConfirm,
  handleUpload,
  parsedUsers,
}) => {
  return (
    <DialogFooter
      className={`flex-col mt-6 sm:flex-row sm:justify-between items-center ${
        isPreviewMode ? 'sm:justify-end' : 'sm:justify-between'
      }`}
    >
      {isFormatError ? (
        <FormatErrorFooter
          downloadCsvTemplate={downloadCsvTemplate}
          resetFormatError={resetFormatError}
        />
      ) : isPreviewMode ? (
        <PreviewModeFooter
          isImporting={isImporting}
          isImported={isImported}
          cancelImport={cancelImport}
          handleConfirm={handleConfirm}
          parsedUsers={parsedUsers}
        />
      ) : (
        <InitialFooter
          isImporting={isImporting}
          downloadCsvTemplate={downloadCsvTemplate}
          handleUpload={handleUpload}
        />
      )}
    </DialogFooter>
  );
};

interface FormatErrorFooterProps {
  downloadCsvTemplate: () => void;
  resetFormatError: () => void;
}

/**
 * Footer component when there's a format error
 */
const FormatErrorFooter: FC<FormatErrorFooterProps> = ({
  downloadCsvTemplate,
  resetFormatError,
}) => (
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
);

interface PreviewModeFooterProps {
  isImporting: boolean;
  isImported: boolean;
  cancelImport: () => void;
  handleConfirm: () => void;
  parsedUsers: {
    importStatus?: ImportStatus;
  }[];
}

/**
 * Footer component for preview mode
 */
const PreviewModeFooter: FC<PreviewModeFooterProps> = ({
  isImporting,
  isImported,
  cancelImport,
  handleConfirm,
  parsedUsers,
}) => (
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
        parsedUsers.some(user => user.importStatus === ImportStatus.Processing)
      }
    >
      {isImporting ? 'Importing...' : isImported ? 'Export' : 'Confirm Import'}
    </Button>
  </>
);

interface InitialFooterProps {
  isImporting: boolean;
  downloadCsvTemplate: () => void;
  handleUpload: () => void;
}

/**
 * Footer component for initial state
 */
const InitialFooter: FC<InitialFooterProps> = ({
  isImporting,
  downloadCsvTemplate,
  handleUpload,
}) => (
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
);
