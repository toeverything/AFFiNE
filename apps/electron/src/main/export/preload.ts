import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  saveFile: (
    canvasEle: HTMLCanvasElement,
    filePath: string,
    fileType: string
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const imageDataUrl = canvasEle.toDataURL(
        fileType === 'pdf' ? 'image/png' : `image/${fileType}`
      );
      const params = {
        imageDataUrl,
        width: canvasEle.width,
        height: canvasEle.height,
        filePath,
        fileType,
      };
      const uniqueId = 'save-file-' + Date.now();
      ipcRenderer.send('save-file', uniqueId, params);
      ipcRenderer.once(`${uniqueId}-reply`, (event, result) => {
        resolve(result);
      });
      ipcRenderer.once(`${uniqueId}-error`, (event, error) => {
        reject(error);
      });
    });
  },
});
