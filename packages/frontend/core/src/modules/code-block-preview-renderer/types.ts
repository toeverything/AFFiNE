import type {
  MermaidRenderRequest,
  MermaidRenderResult,
} from '@affine/core/modules/mermaid/renderer';
import type {
  TypstRenderRequest,
  TypstRenderResult,
} from '@affine/core/modules/typst/renderer';

export type PreviewRenderRequestMap = {
  mermaid: MermaidRenderRequest;
  typst: TypstRenderRequest;
};

export type PreviewRenderResultMap = {
  mermaid: MermaidRenderResult;
  typst: TypstRenderResult;
};
