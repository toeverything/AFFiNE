import { BrowserWindow, dialog, shell } from 'electron';
import fs from 'fs-extra';

import { logger } from '../logger';
import type { ErrorMessage } from './utils';
import { getFakedResult } from './utils';

interface SavePDFFileResult {
  filePath?: string;
  canceled?: boolean;
  error?: ErrorMessage;
}

/**
 * This function is called when the user clicks the "Export to PDF" button in the electron.
 *
 * It will just copy the file to the given path
 */
export async function savePDFFileAs(
  pageTitle: string
): Promise<SavePDFFileResult> {
  try {
    const ret =
      getFakedResult() ??
      (await dialog.showSaveDialog({
        properties: ['showOverwriteConfirmation'],
        title: 'Save PDF',
        showsTagField: false,
        buttonLabel: 'Save',
        defaultPath: `${pageTitle}.pdf`,
        message: 'Save Page as a PDF file',
      }));
    const filePath = ret.filePath;
    if (ret.canceled || !filePath) {
      return {
        canceled: true,
      };
    }

    await BrowserWindow.getFocusedWindow()
      ?.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        landscape: false,
      })
      .then(data => {
        fs.writeFile(filePath, data, error => {
          if (error) throw error;
          logger.log(`Wrote PDF successfully to ${filePath}`);
        });
      });

    shell.openPath(filePath);
    return { filePath };
  } catch (err) {
    logger.error('savePDFFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}
