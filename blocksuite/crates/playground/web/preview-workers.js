// Dedicated Web Worker & host file-picker bridge for `playground` Wasm RaTeX math,
// Hayro PDF previews, and image insertion.
export function installPlaygroundPreviewBridge(wasmExports, baseUrl = window.location.href) {
  let mathWorker = null;
  let pdfWorker = null;
  let nextId = 1;
  const pendingMath = new Map();
  const pendingPdf = new Map();
  const cachedPdfBytes = new Map();

  function rememberPdfBytes(pdfKey, bytes) {
    if (cachedPdfBytes.has(pdfKey)) {
      return cachedPdfBytes.get(pdfKey);
    }
    if (cachedPdfBytes.size >= 16) {
      const oldestKey = cachedPdfBytes.keys().next().value;
      if (oldestKey !== undefined) cachedPdfBytes.delete(oldestKey);
    }
    const copy = new Uint8Array(bytes);
    cachedPdfBytes.set(pdfKey, copy);
    return copy;
  }

  function failAllPendingMath() {
    const entries = Array.from(pendingMath.values());
    pendingMath.clear();
    mathWorker = null;
    for (const req of entries) {
      wasmExports.deliver_math_error(
        req.latex,
        req.display,
        req.fontSizePt,
        req.colorCss,
        req.dpr
      );
    }
  }

  function failAllPendingPdf() {
    const entries = Array.from(pendingPdf.values());
    pendingPdf.clear();
    pdfWorker = null;
    const seenKeys = new Set();
    for (const req of entries) {
      if (!seenKeys.has(req.pdfKey)) {
        seenKeys.add(req.pdfKey);
        if (typeof wasmExports.deliver_pdf_error === 'function') {
          wasmExports.deliver_pdf_error(req.pdfKey);
        }
      }
    }
  }

  function spawnWorker(scriptRel, wasmRel) {
    const scriptUrl = new URL(scriptRel, baseUrl).toString();
    const wasmUrl = new URL(wasmRel, baseUrl).toString();
    const src = [
      `globalThis.AFFINE_WORKER_WASM_URL = ${JSON.stringify(wasmUrl)};`,
      'const __q = [];',
      'const __onMsg = e => __q.push(e);',
      "globalThis.addEventListener('message', __onMsg);",
      `await import(${JSON.stringify(scriptUrl)});`,
      "globalThis.removeEventListener('message', __onMsg);",
      "for (const e of __q) globalThis.dispatchEvent(new MessageEvent('message', { data: e.data, ports: e.ports }));",
    ].join('\n');
    const blobUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return new Worker(blobUrl, { type: 'module' });
  }

  function resolveWorkerAsset(key, fallbackRel) {
    const assets = globalThis.window?.__AFFINE_WORKER_ASSETS__;
    const override = assets && typeof assets[key] === 'string' && assets[key].trim();
    return override || fallbackRel;
  }

  function ensureMathWorker() {
    if (!mathWorker) {
      mathWorker = spawnWorker(
        resolveWorkerAsset('mathScript', './workers/math-worker.js'),
        resolveWorkerAsset('mathWasm', './workers/math-worker.wasm')
      );
      mathWorker.addEventListener('error', failAllPendingMath);
      mathWorker.addEventListener('messageerror', failAllPendingMath);
      mathWorker.addEventListener('message', event => {
        const msg = event?.data;
        if (!msg || !pendingMath.has(msg.id)) return;
        const req = pendingMath.get(msg.id);
        pendingMath.delete(msg.id);
        if (!msg.ok || !msg.result?.rgba) {
          wasmExports.deliver_math_error(
            req.latex,
            req.display,
            req.fontSizePt,
            req.colorCss,
            req.dpr
          );
          return;
        }
        wasmExports.deliver_math_preview(
          req.latex,
          req.display,
          req.fontSizePt,
          req.colorCss,
          req.dpr,
          msg.result.widthPt,
          msg.result.ascentPt,
          msg.result.descentPt,
          msg.result.widthPx,
          msg.result.heightPx,
          msg.result.rgba
        );
      });
    }
    return mathWorker;
  }

  function ensurePdfWorker() {
    if (!pdfWorker) {
      pdfWorker = spawnWorker(
        resolveWorkerAsset('pdfScript', './workers/pdf-worker.js'),
        resolveWorkerAsset('pdfWasm', './workers/pdf-worker.wasm')
      );
      pdfWorker.addEventListener('error', failAllPendingPdf);
      pdfWorker.addEventListener('messageerror', failAllPendingPdf);
      pdfWorker.addEventListener('message', event => {
        const msg = event?.data;
        if (!msg || !pendingPdf.has(msg.id)) return;
        const req = pendingPdf.get(msg.id);
        pendingPdf.delete(msg.id);
        if (!msg.ok || !msg.result) {
          if (typeof wasmExports.deliver_pdf_error === 'function') {
            wasmExports.deliver_pdf_error(req.pdfKey);
          }
          return;
        }
        if (req.op === 'page_count') {
          wasmExports.deliver_pdf_page_count(req.pdfKey, msg.result.pageCount ?? 0);
        } else if (msg.result.rgba) {
          wasmExports.deliver_pdf_page(
            req.pdfKey,
            req.pageIndex,
            msg.result.pageCount ?? 1,
            req.scale,
            msg.result.widthPx,
            msg.result.heightPx,
            msg.result.rgba
          );
        } else if (typeof wasmExports.deliver_pdf_error === 'function') {
          wasmExports.deliver_pdf_error(req.pdfKey);
        }
      });
    }
    return pdfWorker;
  }

  window.__playgroundPreview = {
    requestMath(latex, display, fontSizePt, colorCss, dpr) {
      const id = nextId++;
      pendingMath.set(id, { latex, display, fontSizePt, colorCss, dpr });
      try {
        ensureMathWorker().postMessage({
          id,
          op: 'rgba',
          latex,
          display,
          fontSizePt,
          paddingPt: display ? 4.0 : 1.5,
          colorCss,
          scaleFactor: dpr,
        });
      } catch {
        pendingMath.delete(id);
        wasmExports.deliver_math_error(latex, display, fontSizePt, colorCss, dpr);
      }
    },
    requestPdfPageCount(pdfKey, bytes) {
      const id = nextId++;
      const payload = rememberPdfBytes(pdfKey, bytes);
      pendingPdf.set(id, { op: 'page_count', pdfKey });
      try {
        ensurePdfWorker().postMessage({ id, op: 'page_count', pdfBytes: payload });
      } catch {
        pendingPdf.delete(id);
        if (typeof wasmExports.deliver_pdf_error === 'function') {
          wasmExports.deliver_pdf_error(pdfKey);
        }
      }
    },
    requestPdfPage(pdfKey, bytes, pageIndex, scale) {
      const id = nextId++;
      const payload = rememberPdfBytes(pdfKey, bytes);
      pendingPdf.set(id, { op: 'render_page', pdfKey, pageIndex, scale });
      try {
        ensurePdfWorker().postMessage({
          id,
          pdfBytes: payload,
          pageIndex,
          scale,
        });
      } catch {
        pendingPdf.delete(id);
        if (typeof wasmExports.deliver_pdf_error === 'function') {
          wasmExports.deliver_pdf_error(pdfKey);
        }
      }
    },
    pickImages() {
      const doc = globalThis.document;
      if (!doc || typeof doc.createElement !== 'function') return;
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.style.display = 'none';
      const cleanup = () => {
        input.remove();
      };
      input.addEventListener('change', async () => {
        try {
          const files = Array.from(input.files || []);
          for (const file of files) {
            const buf = await file.arrayBuffer();
            if (buf.byteLength > 0 && typeof wasmExports.deliver_picked_image === 'function') {
              wasmExports.deliver_picked_image(new Uint8Array(buf));
            }
          }
        } finally {
          cleanup();
        }
      });
      input.addEventListener('cancel', cleanup);
      doc.body?.append(input);
      input.click();
    },
    deliverPdfAttachment(bytes, name = 'document.pdf') {
      if (typeof wasmExports.deliver_picked_pdf === 'function') {
        wasmExports.deliver_picked_pdf(bytes, String(name));
      }
    },
  };
}
