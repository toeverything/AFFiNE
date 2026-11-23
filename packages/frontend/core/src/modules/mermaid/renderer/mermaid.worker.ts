import type { MessageCommunicapable } from '@toeverything/infra/op';
import { OpConsumer } from '@toeverything/infra/op';
import initMmdr, { render_mermaid_svg } from '@toeverything/mermaid-wasm';

import type {
  MermaidOps,
  MermaidRenderOptions,
  MermaidRenderRequest,
} from './types';

const DEFAULT_RENDER_OPTIONS: MermaidRenderOptions = {
  fastText: true,
  svgOnly: true,
  theme: 'modern',
  fontFamily: 'IBM Plex Mono',
};

function mergeOptions(
  base: MermaidRenderOptions,
  override: MermaidRenderOptions | undefined
): MermaidRenderOptions {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
    textMetrics: override.textMetrics ?? base.textMetrics,
  };
}

class MermaidRendererBackend extends OpConsumer<MermaidOps> {
  private initPromise: Promise<void> | null = null;
  private options: MermaidRenderOptions = DEFAULT_RENDER_OPTIONS;

  constructor(port: MessageCommunicapable) {
    super(port);
    this.register('init', this.init.bind(this));
    this.register('render', this.render.bind(this));
  }

  private ensureReady() {
    if (!this.initPromise) {
      this.initPromise = initMmdr().then(() => undefined);
    }
    return this.initPromise;
  }

  async init(options?: MermaidRenderOptions) {
    this.options = mergeOptions(DEFAULT_RENDER_OPTIONS, options);
    await this.ensureReady();
    return { ok: true } as const;
  }

  async render({ code, options }: MermaidRenderRequest) {
    await this.ensureReady();
    const mergedOptions = mergeOptions(this.options, options);
    const svg = render_mermaid_svg(code, JSON.stringify(mergedOptions));
    return { svg };
  }
}

new MermaidRendererBackend(self as MessageCommunicapable);
