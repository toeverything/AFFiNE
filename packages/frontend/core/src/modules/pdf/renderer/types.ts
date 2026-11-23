import type { OpSchema } from '@toeverything/infra/op';

export type PageSize = {
  width: number;
  height: number;
};

export type PDFMeta = {
  pageCount: number;
  maxSize: PageSize;
  pageSizes: PageSize[];
};

export type PageSizeOpts = {
  pageNum: number;
};

export type RenderPageOpts = {
  pageNum: number;
  scale?: number;
} & PageSize;

export type RenderedPage = {
  bitmap: ImageBitmap;
};

export interface PDFOps extends OpSchema {
  open: [{ data: ArrayBuffer }, PDFMeta];
  render: [RenderPageOpts, RenderedPage];
}
