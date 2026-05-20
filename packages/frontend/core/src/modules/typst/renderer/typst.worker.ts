import type { MessageCommunicapable } from '@toeverything/infra/op';
import { OpConsumer } from '@toeverything/infra/op';

import {
  DEFAULT_TYPST_RENDER_OPTIONS,
  ensureTypstReady,
  mergeTypstRenderOptions,
  renderTypstSvgWithOptions,
} from './runtime';
import type { TypstOps, TypstRenderOptions, TypstRenderRequest } from './types';

class TypstRendererBackend extends OpConsumer<TypstOps> {
  private options: TypstRenderOptions = DEFAULT_TYPST_RENDER_OPTIONS;

  constructor(port: MessageCommunicapable) {
    super(port);
    this.register('init', this.init.bind(this));
    this.register('render', this.render.bind(this));
  }

  async init(options?: TypstRenderOptions) {
    this.options = mergeTypstRenderOptions(
      DEFAULT_TYPST_RENDER_OPTIONS,
      options
    );
    await ensureTypstReady(
      this.options.fontUrls ?? [
        ...(DEFAULT_TYPST_RENDER_OPTIONS.fontUrls ?? []),
      ]
    );
    return { ok: true } as const;
  }

  async render({ code, options }: TypstRenderRequest) {
    const mergedOptions = mergeTypstRenderOptions(this.options, options);
    return renderTypstSvgWithOptions(code, mergedOptions);
  }
}

new TypstRendererBackend(self as MessageCommunicapable);
