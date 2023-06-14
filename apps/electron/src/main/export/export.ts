import { BrowserWindow, dialog, shell } from 'electron';
import type { WriteFileOptions } from 'fs-extra';
import fs from 'fs-extra';
import { join } from 'path';

import { getExposedMeta } from '../exposed';
import { logger } from '../logger';
import type { ErrorMessage } from './utils';
import { getFakedResult } from './utils';

export interface SavePDFFileResult {
  filePath?: string;
  canceled?: boolean;
  error?: ErrorMessage;
}

async function generatePDF(
  workspaceId: string,
  pageId: string,
  mode: string,
  filePath: string
): Promise<boolean> {
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
    } else {
      // todo
      await win.webContents.executeJavaScript(`
        const savePageToPng = async () => {
          const editor = document.querySelector('editor-container');
          if (editor.createContentParser) {
            const parser = editor.createContentParser();
            const canvas = await parser.transPageToCanvas();
            const pngData = canvas.toDataURL('PNG');
            await window.apis.export.saveFile('${filePath + '.png'}', pngData);
          }
        };
        savePageToPng()
      `);
    }
    return true;
  } finally {
    win.close();
  }
}

// todo maybe need to change page mode
async function createWindow(
  workspaceId: string,
  pageId: string,
  _mode: string
): Promise<BrowserWindow> {
  return new Promise<BrowserWindow>((resolve, reject) => {
    const exposedMeta = getExposedMeta();
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        preload: join(__dirname, '../preload/index.js'),
        additionalArguments: [`--exposed-meta=` + JSON.stringify(exposedMeta)],
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    win.loadURL(
      `${
        process.env.DEV_SERVER_URL || 'file://.'
      }/workspace/${workspaceId}/${pageId}`
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
        reject();
      }
    });
  });
}

async function generatePNG(
  workspaceId: string,
  pageId: string,
  mode: string,
  filePath: string
): Promise<boolean> {
  const win = await createWindow(workspaceId, pageId, mode);
  try {
    await win.webContents.executeJavaScript(`
      const savePageToPng = async () => {
          const editor = document.querySelector('editor-container');
          if (editor.createContentParser) {
            const parser = editor.createContentParser();
            const canvas = await parser.transPageToCanvas();
            const pngData = canvas.toDataURL('PNG');
            await window.apis.export.saveFile('${filePath}', pngData);
          }
      };
      savePageToPng()
    `);
    return true;
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

    await generatePDF(workspaceId, pageId, mode, filePath);
    await shell.openPath(filePath);
    return { filePath };
  } catch (err) {
    logger.error('savePDFFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
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
    await generatePNG(workspaceId, pageId, mode, filePath);
    await shell.openPath(filePath);
    return { filePath };
  } catch (err) {
    logger.error('savePNGFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}

export async function saveFile(
  filePath: string,
  data: string | NodeJS.ArrayBufferView
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let options: WriteFileOptions = null;
    let fileData = data;
    if (filePath.endsWith('.png') && data instanceof String) {
      options = 'base64';
      fileData = data.replace(/^data:image\/png;base64,/, '');
    }
    fs.writeFile(filePath, fileData, options, function (err) {
      if (err) {
        console.log(err);
        reject();
      } else {
        resolve(true);
      }
    });
  });
}
