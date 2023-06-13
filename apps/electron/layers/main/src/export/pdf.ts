import { BrowserWindow, dialog, shell } from 'electron';
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
        setTimeout(async () => {
          const data = await win.webContents.printToPDF(options);
          resolve(data);
        }, 5000);
      } catch (error) {
        console.log(error);
      }
    });
  });
}

function generatePNG(workspaceId: string, pageId: string, filePath: string) {
  const exposedMeta = getExposedMeta();
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      // preload: join(__dirname, 'export/preload.js')
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: [`--exposed-meta=` + JSON.stringify(exposedMeta)],
    },
  });

  win.loadURL(
    `${
      process.env.DEV_SERVER_URL || 'file://.'
    }/workspace/${workspaceId}/${pageId}`
  );

  win.webContents.on('did-finish-load', async () => {
    try {
      win.webContents.openDevTools();
      await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const checkReactRender = setInterval(async () => {
            const rootComponent = document.querySelector('affine-default-page');
            const imageLoadingComponent = document.querySelector('affine-image-block-loading-card');
            if (rootComponent && !imageLoadingComponent) {
              clearInterval(checkReactRender);
              const editor = document.querySelector('editor-container');
              console.log('may may may');
              if (editor.createContentParser) {
                const paser = editor.createContentParser();
                const canvas = await paser.transPageToCanvas();
                const ss = canvas.toDataURL('PNG');
                window.apis.export.saveFile('${filePath}', ss);
              }

              const vLines = Array.from(document.querySelectorAll('v-line'));
              Promise.all(vLines.map(line => line.updateComplete)).then(() => {
                resolve('true');
              })
            }
          }, 100);
        })
      `);
      // const options = {
      //   pageSize: 'A4',
      //   printBackground: true,
      //   landscape: false,
      // };
      // const data = await win.webContents.printToPDF(options);
      // setTimeout(() => {
      //   win.webContents.send('trans-page-canvas', 'this is oly!');
      // }, 1000);
    } catch (error) {
      console.log(error);
    }
  });

  // win.webContents.on('ipc-message', (event, channel, aa: string) => {
  //   console.log('gggggggg');
  //   if (channel === 'trans-page-canvas') {
  //     console.log('hhhhhhhh');
  //     // const ss = aa.toDataURL('image/png');
  //     console.log(aa);
  //   } else {
  //   console.log(channel); // Print the received message from the renderer process
  //   console.log(aa); // Print the received message from the renderer process
  //   console.log(event);
  //   }
  // });
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

export async function savePngFileAs(
  workspaceId: string,
  pageId: string,
  pageTitle: string
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

    await generatePNG(workspaceId, pageId, filePath);
    shell.openPath(filePath);
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
): Promise<SavePDFFileResult> {
  try {
    fs.writeFile(
      filePath,
      (data as string).replace(/^data:image\/png;base64,/, ''),
      'base64',
      function (err) {
        if (err) {
          console.log(err);
        } else {
          console.log('PNG Generated Successfully');
        }
      }
    );

    // fs.writeFile(filePath, data, function (err) {
    //   if (err) {
    //     console.log(err);
    //   } else {
    //     console.log('PNG Generated Successfully');
    //   }
    // });
    shell.openPath(filePath);
    return { filePath };
  } catch (err) {
    logger.error('savePNGFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}
