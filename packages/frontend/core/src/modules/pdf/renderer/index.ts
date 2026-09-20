import { WorkerOpRenderer } from '../../shared/worker-op-renderer';
import type { PDFOps } from './types';

export class PDFRenderer extends WorkerOpRenderer<PDFOps> {
  constructor() {
    super('pdf');
  }
}

export type { PDFMeta, PDFOps, RenderedPage, RenderPageOpts } from './types';
