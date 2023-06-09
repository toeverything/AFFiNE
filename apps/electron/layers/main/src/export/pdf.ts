import { BrowserWindow, dialog, shell } from 'electron';
import fs from 'fs-extra';

import { logger } from '../logger';
import type { ErrorMessage } from './utils';
import { getFakedResult } from './utils';

export interface SavePDFFileResult {
  filePath?: string;
  canceled?: boolean;
  error?: ErrorMessage;
}

async function transPageToPDF(
  workspaceId: string,
  pageId: string
): Promise<Buffer> {
  return new Promise<Buffer>(resolve => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
      },
    });

    win.loadURL(
      `${
        process.env.DEV_SERVER_URL || 'file://.'
      }/workspace/${workspaceId}/${pageId}`
    );

    win.webContents.on('did-finish-load', async () => {
      try {
        await win.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const checkReactRender = setInterval(() => {
              const rootComponent = document.querySelector('affine-default-page');
              const imageLoadingComponent = document.querySelector('affine-image-block-loading-card');
              if (rootComponent && !imageLoadingComponent) {
                clearInterval(checkReactRender);
                const vLines = Array.from(document.querySelectorAll('v-line'));
                Promise.all(vLines.map(line => line.updateComplete)).then(() => {
                  resolve('true');
                })
              }
            }, 100);
          })
        `);
        const options = {
          pageSize: 'A4',
          printBackground: true,
          landscape: false,
        };
        const data = await win.webContents.printToPDF(options);
        resolve(data);
      } catch (error) {
        console.log(error);
      }
    });
  });
}

/**
 * This function is called when the user clicks the "Export to PDF" button in the electron.
 *
 * It will just copy the file to the given path
 */
export async function savePDFFileAs(
  workspaceId: string,
  pageId: string,
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

    const data = await transPageToPDF(workspaceId, pageId);

    fs.writeFile(filePath, data, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log('PDF Generated Successfully');
      }
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
