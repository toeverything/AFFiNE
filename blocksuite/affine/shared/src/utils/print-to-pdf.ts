export async function printToPdf(
  rootElement: HTMLElement | null = document.querySelector(
    '.affine-page-viewport'
  ),
  options: {
    /**
     * Callback that is called when ready to print.
     */
    beforeprint?: (iframe: HTMLIFrameElement) => Promise<void> | void;
    /**
     * Callback that is called after the print dialog is closed.
     * Notice: in some browser this may be triggered immediately.
     */
    afterprint?: () => Promise<void> | void;
  } = {}
) {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    iframe.style.display = 'none';
    iframe.srcdoc = '<!DOCTYPE html>';
    iframe.onload = async () => {
      if (!iframe.contentWindow) {
        reject(new Error('unable to print pdf'));
        return;
      }
      if (!rootElement) {
        reject(new Error('Root element not defined, unable to print pdf'));
        return;
      }
      iframe.contentWindow.document
        .write(`<!DOCTYPE html><html><head><style>@media print {
              html, body {
                height: initial !important;
                overflow: initial !important;
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
              ::-webkit-scrollbar {
                display: none;
              }
              :root {
                --affine-note-shadow-box: none !important;
                --affine-note-shadow-sticker: none !important;
              }
            }</style></head><body></body></html>`);

      // copy all styles to iframe
      for (const element of document.styleSheets) {
        try {
          for (const cssRule of element.cssRules) {
            const target = iframe.contentWindow.document.styleSheets[0];
            target.insertRule(cssRule.cssText, target.cssRules.length);
          }
        } catch (e) {
          if (element.href) {
            console.warn(
              'css cannot be applied when printing pdf, this may be because of CORS policy from its domain.',
              element.href
            );
          } else {
            reject(e);
          }
        }
      }

      // convert all canvas to image
      const canvasImgObjectUrlMap = new Map<string, string>();
      const allCanvas = rootElement.getElementsByTagName('canvas');
      let canvasKey = 1;
      for (const canvas of allCanvas) {
        canvas.dataset['printToPdfCanvasKey'] = canvasKey.toString();
        canvasKey++;
        const canvasImgObjectUrl = await new Promise<Blob | null>(resolve => {
          try {
            canvas.toBlob(resolve);
          } catch {
            resolve(null);
          }
        });
        if (!canvasImgObjectUrl) {
          console.warn(
            'canvas cannot be converted to image when printing pdf, this may be because of CORS policy'
          );
          continue;
        }
        canvasImgObjectUrlMap.set(
          canvas.dataset['printToPdfCanvasKey'],
          URL.createObjectURL(canvasImgObjectUrl)
        );
      }

      const importedRoot = iframe.contentWindow.document.importNode(
        rootElement,
        true
      ) as HTMLDivElement;

      // draw saved canvas image to canvas
      const allImportedCanvas = importedRoot.getElementsByTagName('canvas');
      for (const importedCanvas of allImportedCanvas) {
        const canvasKey = importedCanvas.dataset['printToPdfCanvasKey'];
        if (canvasKey) {
          const canvasImg = canvasImgObjectUrlMap.get(canvasKey);
          const ctx = importedCanvas.getContext('2d');
          if (canvasImg && ctx) {
            const image = new Image();
            image.src = canvasImg;
            await image.decode();
            ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
          }
        }
      }

      // append to iframe and print
      iframe.contentWindow.document.body.append(importedRoot);

      await options.beforeprint?.(iframe);

      // browser may take some time to load font
      await new Promise<void>(resolve => {
        setTimeout(() => {
          resolve();
        }, 1000);
      });

      iframe.contentWindow.onafterprint = async () => {
        iframe.remove();

        // clean up
        for (const canvas of allCanvas) {
          delete canvas.dataset['printToPdfCanvasKey'];
        }
        for (const [_, url] of canvasImgObjectUrlMap) {
          URL.revokeObjectURL(url);
        }

        await options.afterprint?.();

        resolve();
      };

      iframe.contentWindow.print();
    };
  });
}
