// Dedicated Web Worker & host file-picker bridge for `playground` Wasm RaTeX math,
// Hayro PDF previews, and image insertion.
export function installPlaygroundPreviewBridge(wasmExports, baseUrl = window.location.href) {
  let mathWorker = null;
  let pdfWorker = null;
  let mermaidWorker = null;
  let typstWorker = null;
  let nextId = 1;
  const pendingMath = new Map();
  const pendingPdf = new Map();
  const pendingCode = new Map();
  const cachedPdfBytes = new Map();
  const mountedHtmlEmbeds = new Map();

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
    if (mathWorker) {
      mathWorker.terminate?.();
      mathWorker = null;
    }
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
    if (pdfWorker) {
      pdfWorker.terminate?.();
      pdfWorker = null;
    }
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

  async function handleCodeMessage(event) {
    const msg = event?.data;
    if (!msg || !pendingCode.has(msg.id)) return;
    const req = pendingCode.get(msg.id);
    pendingCode.delete(msg.id);
    if (!msg.ok || !msg.result?.svg) {
      wasmExports.deliver_code_preview_error?.(
        req.kind,
        req.source,
        req.dark,
        req.dpr,
        msg.error || 'render failed'
      );
      return;
    }
    try {
      const blob = new Blob([msg.result.svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      const scale = Math.max(1, Math.min(4, req.dpr || 2));
      const wPt = Math.max(1, img.naturalWidth || 320);
      const hPt = Math.max(1, img.naturalHeight || 160);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(wPt * scale);
      canvas.height = Math.round(hPt * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, wPt, hPt);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      wasmExports.deliver_code_preview?.(
        req.kind,
        req.source,
        req.dark,
        req.dpr,
        wPt,
        hPt,
        canvas.width,
        canvas.height,
        new Uint8Array(rgba.buffer)
      );
    } catch (err) {
      wasmExports.deliver_code_preview_error?.(
        req.kind,
        req.source,
        req.dark,
        req.dpr,
        String(err)
      );
    }
  }

  function failAllPendingCode(kind, reason = 'code preview worker error') {
    if (kind === 'mermaid' && mermaidWorker) {
      mermaidWorker.terminate?.();
      mermaidWorker = null;
    } else if (kind === 'typst' && typstWorker) {
      typstWorker.terminate?.();
      typstWorker = null;
    }
    for (const [id, req] of pendingCode.entries()) {
      if (kind && req.kind !== kind) continue;
      pendingCode.delete(id);
      wasmExports.deliver_code_preview_error?.(
        req.kind,
        req.source,
        req.dark,
        req.dpr,
        String(reason)
      );
    }
  }

  function ensureDiagramWorker(kind) {
    if (kind === 'mermaid') {
      if (!mermaidWorker) {
        mermaidWorker = spawnWorker(
          resolveWorkerAsset('mermaidScript', './workers/mermaid-worker.js'),
          resolveWorkerAsset('mermaidWasm', './workers/mermaid-worker.wasm')
        );
        mermaidWorker.addEventListener('message', handleCodeMessage);
        mermaidWorker.addEventListener('error', () => failAllPendingCode('mermaid', 'mermaid worker error'));
        mermaidWorker.addEventListener('messageerror', () =>
          failAllPendingCode('mermaid', 'mermaid worker messageerror')
        );
      }
      return mermaidWorker;
    }
    if (!typstWorker) {
      typstWorker = spawnWorker(
        resolveWorkerAsset('typstScript', './workers/typst-worker.js'),
        resolveWorkerAsset('typstWasm', './workers/typst-worker.wasm')
      );
      typstWorker.addEventListener('message', handleCodeMessage);
      typstWorker.addEventListener('error', () => failAllPendingCode('typst', 'typst worker error'));
      typstWorker.addEventListener('messageerror', () =>
        failAllPendingCode('typst', 'typst worker messageerror')
      );
    }
    return typstWorker;
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
    requestCodePreview(kind, source, dark, dpr) {
      const id = nextId++;
      pendingCode.set(id, { kind, source, dark, dpr });
      try {
        ensureDiagramWorker(kind).postMessage(
          kind === 'mermaid'
            ? { id, source, theme: dark ? 'dark' : 'light' }
            : { id, source, pageIndex: 0 }
        );
      } catch (err) {
        pendingCode.delete(id);
        wasmExports.deliver_code_preview_error?.(kind, source, dark, dpr, String(err));
      }
    },
    mountHtmlEmbed(id, html, xOrRect, y, w, h) {
      const layer = globalThis.document?.getElementById('embed-layer');
      if (!layer) return;
      const htmlStr = String(html || '');
      const rect =
        xOrRect && typeof xOrRect === 'object'
          ? xOrRect
          : typeof xOrRect === 'number'
            ? { x: xOrRect, y, w, h }
            : null;
      let entry = mountedHtmlEmbeds.get(id);
      if (!entry) {
        const blobUrl = URL.createObjectURL(
          new Blob([htmlStr], { type: 'text/html;charset=utf-8' })
        );
        const iframe = document.createElement('iframe');
        // Never include allow-same-origin for user-authored HTML embeds or ```html previews.
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        iframe.style.position = 'absolute';
        iframe.style.border = '0';
        iframe.style.pointerEvents = 'auto';
        iframe.src = blobUrl;
        layer.append(iframe);
        entry = { iframe, blobUrl, html: htmlStr };
        mountedHtmlEmbeds.set(id, entry);
      } else if (entry.html !== htmlStr) {
        URL.revokeObjectURL(entry.blobUrl);
        const blobUrl = URL.createObjectURL(
          new Blob([htmlStr], { type: 'text/html;charset=utf-8' })
        );
        entry.blobUrl = blobUrl;
        entry.html = htmlStr;
        entry.iframe.src = blobUrl;
      }
      entry.iframe.style.display = 'block';
      if (rect) {
        entry.iframe.style.left = `${rect.x}px`;
        entry.iframe.style.top = `${rect.y}px`;
        entry.iframe.style.width = `${rect.w}px`;
        entry.iframe.style.height = `${rect.h}px`;
      }
    },
    unmountHtmlEmbed(id) {
      const entry = mountedHtmlEmbeds.get(id);
      if (!entry) return;
      entry.iframe.remove();
      URL.revokeObjectURL(entry.blobUrl);
      mountedHtmlEmbeds.delete(id);
    },
    reconcileHtmlEmbeds(entriesOrJson) {
      let list = entriesOrJson;
      if (typeof entriesOrJson === 'string') {
        try {
          list = JSON.parse(entriesOrJson);
        } catch {
          return;
        }
      }
      if (!Array.isArray(list)) return;
      const keep = new Set();
      for (const item of list) {
        if (!item || typeof item.id !== 'string') continue;
        keep.add(item.id);
        if (item.visible && item.w > 0 && item.h > 0) {
          this.mountHtmlEmbed(item.id, item.html || '', {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          });
        } else {
          const existing = mountedHtmlEmbeds.get(item.id);
          if (existing) {
            existing.iframe.style.display = 'none';
          }
        }
      }
      for (const mountedId of Array.from(mountedHtmlEmbeds.keys())) {
        if (!keep.has(mountedId)) {
          this.unmountHtmlEmbed(mountedId);
        }
      }
    },
    shieldEmbeds(shielded) {
      const layer = globalThis.document?.getElementById('embed-layer');
      if (!layer) return;
      layer.style.visibility = shielded ? 'hidden' : 'visible';
      layer.style.pointerEvents = 'none';
      for (const entry of mountedHtmlEmbeds.values()) {
        entry.iframe.style.pointerEvents = shielded ? 'none' : 'auto';
      }
    },
  };
}
