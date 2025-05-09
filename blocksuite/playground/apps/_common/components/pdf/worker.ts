import type { Document } from '@toeverything/pdf-viewer';
import {
  createPDFium,
  PageRenderingflags,
  Runtime,
  Viewer,
} from '@toeverything/pdf-viewer';
import wasmUrl from '@toeverything/pdfium/wasm?url';

import { type MessageData, type MessageDataType, MessageOp } from './types';

let inited = false;
let viewer: Viewer | null = null;
let doc: Document | undefined = undefined;

const docInfo = { total: 0, width: 1, height: 1 };
const flags = PageRenderingflags.REVERSE_BYTE_ORDER | PageRenderingflags.ANNOT;

function post<T extends MessageOp>(type: T, data?: MessageDataType[T]) {
  const message = { type, [type]: data };
  self.postMessage(message);
}

function renderToImageData(index: number, scale: number) {
  if (!viewer || !doc) return;

  const page = doc.page(index);

  if (!page) return;

  const width = Math.ceil(docInfo.width * scale);
  const height = Math.ceil(docInfo.height * scale);

  const bitmap = viewer.createBitmap(width, height, 0);
  bitmap.fill(0, 0, width, height);
  page.render(bitmap, 0, 0, width, height, 0, flags);

  const data = new Uint8ClampedArray(bitmap.toUint8Array());

  bitmap.close();
  page.close();

  return new ImageData(data, width, height);
}

async function start() {
  inited = true;

  console.debug('pdf worker pending');
  self.postMessage({ type: MessageOp.Init });

  const pdfium = await createPDFium({
    // @ts-expect-error allow
    locateFile: () => wasmUrl,
  });
  viewer = new Viewer(new Runtime(pdfium));

  self.postMessage({ type: MessageOp.Inited });
  console.debug('pdf worker ready');
}

async function process({ data }: MessageEvent<MessageData>) {
  if (!inited) {
    await start();
  }

  if (!viewer) return;

  const { type } = data;

  switch (type) {
    case MessageOp.Open: {
      const buffer = data[type];
      if (!buffer) return;

      doc = viewer.open(new Uint8Array(buffer));

      if (!doc) return;

      const page = doc.page(0);

      if (!page) return;

      Object.assign(docInfo, {
        total: doc.pageCount(),
        height: Math.ceil(page.height()),
        width: Math.ceil(page.width()),
      });
      page.close();
      post(MessageOp.Opened, docInfo);

      break;
    }

    case MessageOp.Render: {
      if (!doc) return;

      const { index, kind, scale } = data[type];

      const { total } = docInfo;

      if (index < 0 || index >= total) return;

      queueMicrotask(() => {
        const imageData = renderToImageData(index, scale);
        if (!imageData) return;

        post(MessageOp.Rendered, { index, kind, imageData });
      });

      break;
    }
  }
}

self.addEventListener('message', (event: MessageEvent<MessageData>) => {
  process(event).catch(console.error);
});

start().catch(error => {
  inited = false;
  console.log(error);
});
