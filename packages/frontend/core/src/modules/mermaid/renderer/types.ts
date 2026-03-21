import type { OpSchema } from '@toeverything/infra/op';

export type MermaidTextMetrics = {
  ascii: number;
  cjk: number;
  space: number;
};

export type MermaidRenderTheme = 'modern' | 'default';

export type MermaidRenderOptions = {
  fastText?: boolean;
  svgOnly?: boolean;
  textMetrics?: MermaidTextMetrics;
  theme?: MermaidRenderTheme;
  fontFamily?: string;
  fontSize?: number;
};

export type MermaidRenderRequest = {
  code: string;
  options?: MermaidRenderOptions;
};

export type MermaidRenderResult = {
  svg: string;
};

export interface MermaidOps extends OpSchema {
  init: [MermaidRenderOptions | undefined, { ok: true }];
  render: [MermaidRenderRequest, MermaidRenderResult];
}
