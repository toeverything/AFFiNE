import type { OpSchema } from '@toeverything/infra/op';

export type TypstRenderOptions = {
  fontUrls?: string[];
};

export type TypstRenderRequest = {
  code: string;
  options?: TypstRenderOptions;
};

export type TypstRenderResult = {
  svg: string;
};

export interface TypstOps extends OpSchema {
  init: [TypstRenderOptions | undefined, { ok: true }];
  render: [TypstRenderRequest, TypstRenderResult];
}
