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
    // Use a hidden but rendering-enabled state instead of display: none
    Object.assign(iframe.style, {
      visibility: 'hidden',
      position: 'absolute',
      width: '0',
      height: '0',
      border: 'none',
    });
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

      const doc = iframe.contentWindow.document;

      doc.write(`<!DOCTYPE html><html><head><style>@media print {
                html, body {
                  height: initial !important;
                  overflow: initial !important;
                  print-color-adjust: exact;
                  -webkit-print-color-adjust: exact;
                  color: #000 !important;
                  background: #fff !important;
                  color-scheme: light !important;
                }
                ::-webkit-scrollbar { 
                  display: none; 
                }
                :root, body {
                  --affine-text-primary: #000 !important;
                  --affine-text-secondary: #111 !important;
                  --affine-text-tertiary: #333 !important;
                  --affine-background-primary: #fff !important;
                  --affine-background-secondary: #fff !important;
                  --affine-background-tertiary: #fff !important;
                }
                body, [data-theme='dark'] {
                  color: #000 !important;
                  background: #fff !important;
                }
                body * {
                  color: #000 !important;
                  -webkit-text-fill-color: #000 !important;
                }
                :root {
                  --affine-note-shadow-box: none !important;
                  --affine-note-shadow-sticker: none !important;
                }
              }</style></head><body></body></html>`);
      doc.close();
      iframe.contentWindow.document
        .write(`<!DOCTYPE html><html><head><style>@media print {
              html, body {
                height: initial !important;
                overflow: initial !important;
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
                color: #000 !important;
                background: #fff !important;
                color-scheme: light !important;
              }
              ::-webkit-scrollbar { 
                display: none; 
              }
              :root, body {
                --affine-text-primary: #000 !important;
                --affine-text-secondary: #111 !important;
                --affine-text-tertiary: #333 !important;
                --affine-background-primary: #fff !important;
                --affine-background-secondary: #fff !important;
                --affine-background-tertiary: #fff !important;
                --affine-background-code-block: #f5f5f5 !important;
                --affine-quote-color: #e3e3e3 !important;
                --affine-border-color: #e3e3e3 !important;
              }
              body, [data-theme='dark'] {
                color: #000 !important;
                background: #fff !important;
              }
              body * {
                color: #000 !important;
                -webkit-text-fill-color: #000 !important;
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
            const target = doc.styleSheets[0];
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

      // Recursive function to find all canvases, including those in shadow roots
      const findAllCanvases = (root: Node): HTMLCanvasElement[] => {
        const canvases: HTMLCanvasElement[] = [];
        const traverse = (node: Node) => {
          if (node instanceof HTMLCanvasElement) {
            canvases.push(node);
          }
          if (node instanceof HTMLElement || node instanceof ShadowRoot) {
            node.childNodes.forEach(traverse);
          }
          if (node instanceof HTMLElement && node.shadowRoot) {
            traverse(node.shadowRoot);
          }
        };
        traverse(root);
        return canvases;
      };

      // convert all canvas to image
      const canvasImgObjectUrlMap = new Map<string, string>();
      const allCanvas = findAllCanvases(rootElement);
      let canvasKey = 1;
      const canvasToKeyMap = new Map<HTMLCanvasElement, string>();

      for (const canvas of allCanvas) {
        const key = canvasKey.toString();
        canvasToKeyMap.set(canvas, key);
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
        canvasImgObjectUrlMap.set(key, URL.createObjectURL(canvasImgObjectUrl));
      }

      // Recursive deep clone that flattens Shadow DOM into Light DOM
      const deepCloneWithShadows = (node: Node): Node => {
        const clone = doc.importNode(node, false);

        if (
          clone instanceof HTMLCanvasElement &&
          node instanceof HTMLCanvasElement
        ) {
          const key = canvasToKeyMap.get(node);
          if (key) {
            clone.dataset['printToPdfCanvasKey'] = key;
          }
        }

        const appendChildren = (source: Node) => {
          source.childNodes.forEach(child => {
            (clone as Element).append(deepCloneWithShadows(child));
          });
        };

        if (node instanceof HTMLElement && node.shadowRoot) {
          appendChildren(node.shadowRoot);
        }
        appendChildren(node);

        return clone;
      };

      const importedRoot = deepCloneWithShadows(rootElement) as HTMLDivElement;

      // force light theme in print iframe
      doc.documentElement.dataset.theme = 'light';
      doc.body.dataset.theme = 'light';
      importedRoot.dataset.theme = 'light';

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

      // Remove lazy loading from all images and force reload
      const allImages = importedRoot.querySelectorAll('img');
      allImages.forEach(img => {
        img.removeAttribute('loading');
        const src = img.getAttribute('src');
        if (src) img.setAttribute('src', src);
      });

      // append to iframe
      doc.body.append(importedRoot);

      await options.beforeprint?.(iframe);

      // Robust image waiting logic
      const waitForImages = async (container: HTMLElement) => {
        const images: HTMLImageElement[] = [];
        const view = container.ownerDocument.defaultView;
        if (!view) return;

        const findImages = (root: Node) => {
          if (root instanceof view.HTMLImageElement) {
            images.push(root);
          }
          if (
            root instanceof view.HTMLElement ||
            root instanceof view.ShadowRoot
          ) {
            root.childNodes.forEach(findImages);
          }
          if (root instanceof view.HTMLElement && root.shadowRoot) {
            findImages(root.shadowRoot);
          }
        };

        findImages(container);

        await Promise.all(
          images.map(img => {
            if (img.complete) {
              if (img.naturalWidth === 0) {
                console.warn('Image failed to load:', img.src);
              }
              return Promise.resolve();
            }
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          })
        );
      };

      await waitForImages(importedRoot);

      // browser may take some time to load font or other resources
      await (doc.fonts?.ready ??
        new Promise<void>(resolve => {
          setTimeout(() => {
            resolve();
          }, 1000);
        }));

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
