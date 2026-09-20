import { WorkerOpRenderer } from '../../shared/worker-op-renderer';
import type { TypstOps, TypstRenderOptions, TypstRenderRequest } from './types';

class TypstRenderer extends WorkerOpRenderer<TypstOps> {
  constructor() {
    super('typst');
  }

  init(options?: TypstRenderOptions) {
    return this.ensureInitialized(() => this.call('init', options));
  }

  async render(request: TypstRenderRequest) {
    await this.init();
    return this.call('render', request);
  }
}

let sharedTypstRenderer: TypstRenderer | null = null;

export function getTypstRenderer() {
  if (!sharedTypstRenderer) {
    sharedTypstRenderer = new TypstRenderer();
  }
  return sharedTypstRenderer;
}

export type {
  TypstOps,
  TypstRenderOptions,
  TypstRenderRequest,
  TypstRenderResult,
} from './types';
