import {
  type MessageCommunicapable,
  OpConsumer,
  transfer,
} from '@toeverything/infra/op';
import type { Document } from '@toeverything/pdf-viewer';
import {
  createPDFium,
  PageRenderingflags,
  Runtime,
  Viewer,
} from '@toeverything/pdf-viewer';
import {
  BehaviorSubject,
  combineLatestWith,
  filter,
  from,
  map,
  Observable,
  ReplaySubject,
  retry,
  share,
  switchMap,
} from 'rxjs';

import type { ClientOps } from './ops';
import type { PDFMeta, RenderPageOpts } from './types';

class PDFRendererBackend extends OpConsumer<ClientOps> {
  constructor(port: MessageCommunicapable) {
    super(port);
    this.register('open', this.open.bind(this));
    this.register('render', this.render.bind(this));
  }
  private readonly viewer$: Observable<Viewer> = from(
    createPDFium().then(pdfium => {
      return new Viewer(new Runtime(pdfium));
    })
  );

  private readonly binary$ = new BehaviorSubject<Uint8Array | null>(null);

  private readonly doc$ = this.binary$.pipe(
    filter(Boolean),
    combineLatestWith(this.viewer$.pipe(retry(1))),
    switchMap(([buffer, viewer]) => {
      return new Observable<Document | undefined>(observer => {
        const doc = viewer.open(buffer);

        if (!doc) {
          observer.error(new Error('Document not opened'));
          return;
        }

        observer.next(doc);

        return () => {
          setTimeout(() => {
            doc.close();
          }, 1000); // Waits for ObjectPool GC
        };
      });
    }),
    share({
      connector: () => new ReplaySubject(1),
    })
  );

  private readonly docInfo$: Observable<PDFMeta> = this.doc$.pipe(
    map(doc => {
      if (!doc) {
        throw new Error('Document not opened');
      }

      const pageCount = doc.pageCount();
      const pageSizes = [];
      let i = 0;
      let maxWidth = 0;
      let maxHeight = 0;

      for (; i < pageCount; i++) {
        const page = doc.page(i);
        if (!page) {
          throw new Error('Page not found');
        }
        const size = page.size();
        const width = Math.ceil(size.width);
        const height = Math.ceil(size.height);

        maxWidth = Math.max(maxWidth, width);
        maxHeight = Math.max(maxHeight, height);

        pageSizes.push({ width, height });
        page.close();
      }

      return {
        pageCount,
        pageSizes,
        maxSize: { width: maxWidth, height: maxHeight },
      };
    })
  );

  open({ data }: { data: ArrayBuffer }) {
    this.binary$.next(new Uint8Array(data));
    return this.docInfo$;
  }

  render(opts: RenderPageOpts) {
    return this.doc$.pipe(
      combineLatestWith(this.viewer$),
      switchMap(([doc, viewer]) => {
        if (!doc) {
          throw new Error('Document not opened');
        }

        return from(this.renderPage(viewer, doc, opts));
      }),
      map(bitmap => {
        if (!bitmap) {
          throw new Error('Failed to render page');
        }

        return transfer({ ...opts, bitmap }, [bitmap]);
      })
    );
  }

  async renderPage(viewer: Viewer, doc: Document, opts: RenderPageOpts) {
    const page = doc.page(opts.pageNum);
    if (!page) return;

    const scale = opts.scale ?? 1;
    const width = Math.ceil(opts.width * scale);
    const height = Math.ceil(opts.height * scale);

    const bitmap = viewer.createBitmap(width, height, 0);
    bitmap.fill(0, 0, width, height);
    page.render(
      bitmap,
      0,
      0,
      width,
      height,
      0,
      PageRenderingflags.REVERSE_BYTE_ORDER | PageRenderingflags.ANNOT
    );

    const data = new Uint8ClampedArray(bitmap.toUint8Array());
    const imageData = new ImageData(data, width, height);
    const imageBitmap = await createImageBitmap(imageData);

    bitmap.close();
    page.close();

    return imageBitmap;
  }
}

new PDFRendererBackend(self as MessageCommunicapable);
