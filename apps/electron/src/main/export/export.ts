import { BrowserWindow, dialog, shell } from 'electron';
import fs from 'fs-extra';
import { jsPDF } from 'jspdf';
import { join } from 'path';

import { logger } from '../logger';
import type { ErrorMessage } from './utils';
import { getFakedResult } from './utils';

export interface SavePDFFileResult {
  filePath?: string;
  canceled?: boolean;
  error?: ErrorMessage;
}

interface SaveInfo {
  imageDataUrl: string;
  width: number;
  height: number;
  filePath: string;
  fileType: string;
}

// todo maybe need to change page mode
async function createWindow(
  workspaceId: string,
  pageId: string,
  _mode: string
): Promise<BrowserWindow> {
  return new Promise<BrowserWindow>((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        preload: join(__dirname, './main/export.js'),
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    win.loadURL(
      `${
        process.env.DEV_SERVER_URL || 'file://.'
      }/workspace/${workspaceId}/${pageId}`
    );

    win.webContents.on(
      'ipc-message',
      async (event, channel, uniqueId: string, params) => {
        if (channel === 'save-file') {
          try {
            const result = await saveFileAs(params as SaveInfo);
            win.webContents.send(uniqueId + '-reply', result);
          } catch (error) {
            win.webContents.send(uniqueId + '-error', error);
          }
        }
      }
    );

    win.webContents.on('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`
          new Promise((resolve) => {
            let count = 0;
            const checkReactRender = setInterval(async () => {
              const rootDefaultComponent = document.querySelector('affine-default-page');
              const rootEdgelessComponent = document.querySelector('affine-edgeless-page');
              const imageLoadingComponent = document.querySelector('affine-image-block-loading-card');
              if ((rootDefaultComponent || rootEdgelessComponent) && !imageLoadingComponent) {
                clearInterval(checkReactRender);
                resolve('true');
              }
              count++;
              if (count > 10 * 60) {
                clearInterval(checkReactRender);
                resolve('false');
              }
            }, 100);
          })
        `);
        if (result === 'false') {
          win.close();
          reject();
        } else {
          resolve(win);
        }
      } catch (error) {
        console.log(error);
        win.close();
        reject();
      }
    });
  });
}

async function saveFileAs(params: SaveInfo): Promise<string> {
  const { imageDataUrl, width, height, filePath, fileType } = params;
  return new Promise<string>((resolve, reject) => {
    console.log('pdfDataUrl');

    const typeMatch = imageDataUrl.match(/^data:image\/(png|jpeg|gif);base64,/);
    if (!typeMatch) {
      reject('Invalid image format');
      return;
    }
    const imageType = typeMatch[1];
    const extension =
      fileType === 'pdf' ? fileType : imageType === 'jpeg' ? 'jpg' : imageType;
    const finalFilePath = filePath.endsWith('.' + extension)
      ? filePath
      : `${filePath}.${extension}`;

    if (fileType === 'pdf') {
      const pdf = new jsPDF(width < height ? 'p' : 'l', 'pt', [width, height]);
      pdf.addImage(imageDataUrl, imageType, 0, 0, width, height);
      pdf
        .save(finalFilePath, { returnPromise: true })
        .then(() => {
          console.log('PDF Generated Successfully');
          resolve(finalFilePath);
        })
        .catch(err => {
          console.log(err);
          reject(err);
        });
    } else {
      const base64Data = imageDataUrl.replace(
        /^data:image\/(png|jpeg|gif);base64,/,
        ''
      );

      fs.writeFile(finalFilePath, base64Data, 'base64', err => {
        if (err) {
          console.error('Error saving image:', err);
          reject(err);
        } else {
          console.log('Image saved successfully!');
          resolve(finalFilePath);
        }
      });
    }
  });
}

async function generatePDF(
  workspaceId: string,
  pageId: string,
  mode: string,
  filePath: string
): Promise<string> {
  const win = await createWindow(workspaceId, pageId, mode);
  try {
    if (mode === 'page') {
      const options = {
        pageSize: 'A4',
        printBackground: true,
        landscape: false,
      };
      const data = await win.webContents.printToPDF(options);
      fs.writeFile(filePath, data, function (err) {
        if (err) {
          console.log(err);
        } else {
          console.log('PDF Generated Successfully');
        }
      });
      return filePath;
    } else {
      const finalFilePath = await win.webContents.executeJavaScript(`
        const savePageToPng = async () => {
          const editor = document.querySelector('editor-container');
          if (editor.createContentParser) {
            const parser = editor.createContentParser();
            const canvas = await parser.transPageToCanvas();
            const finalFilePath = await window.api.saveFile(canvas, '${filePath}', 'pdf');
            return finalFilePath;
          }
        };
        savePageToPng()
      `);
      return finalFilePath;
    }
  } finally {
    win.close();
  }
}

/**
 * This function is called when the user clicks the "Export to PDF" button in the electron.
 *
 * It will just copy the file to the given path
 */
export async function savePDFFileAs(
  workspaceId: string,
  pageId: string,
  pageTitle: string,
  mode: string
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

    const finalFilePath = await generatePDF(
      workspaceId,
      pageId,
      mode,
      filePath
    );
    await shell.openPath(finalFilePath);
    return { filePath: finalFilePath };
  } catch (err) {
    logger.error('savePDFFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}

async function generatePNG(
  workspaceId: string,
  pageId: string,
  mode: string,
  filePath: string
): Promise<string> {
  const win = await createWindow(workspaceId, pageId, mode);
  try {
    const finalFilePath = await win.webContents.executeJavaScript(`
      const savePageToPng = async () => {
          const editor = document.querySelector('editor-container');
          if (editor.createContentParser) {
            const parser = editor.createContentParser();
            const canvas = await parser.transPageToCanvas();
            const finalFilePath = await window.api.saveFile(canvas, '${filePath}', 'png');
            return finalFilePath;
          }
      };
      savePageToPng()
    `);
    console.log('finalFilePath', finalFilePath);
    return finalFilePath;
  } finally {
    win.close();
  }
}

export async function savePngFileAs(
  workspaceId: string,
  pageId: string,
  pageTitle: string,
  mode: string
): Promise<SavePDFFileResult> {
  try {
    const ret =
      getFakedResult() ??
      (await dialog.showSaveDialog({
        properties: ['showOverwriteConfirmation'],
        title: 'Save PNG',
        showsTagField: false,
        buttonLabel: 'Save',
        defaultPath: `${pageTitle}.png`,
        message: 'Save Page as a PNG file',
      }));
    const filePath = ret.filePath;
    if (ret.canceled || !filePath) {
      return {
        canceled: true,
      };
    }
    const finalFilePath = await generatePNG(
      workspaceId,
      pageId,
      mode,
      filePath
    );
    await shell.openPath(finalFilePath);
    return { filePath: finalFilePath };
  } catch (err) {
    logger.error('savePNGFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}
