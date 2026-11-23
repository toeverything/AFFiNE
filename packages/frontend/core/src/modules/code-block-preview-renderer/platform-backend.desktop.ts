import { apis } from '@affine/electron-api';

import { renderClassicMermaidSvg } from './classic-mermaid';
import { isMermaidWasmNativeRendererEnabled } from './runtime-config';
import type { PreviewRenderRequestMap, PreviewRenderResultMap } from './types';

type DesktopPreviewHandlers = {
  renderMermaidSvg?: (
    request: PreviewRenderRequestMap['mermaid']
  ) => Promise<PreviewRenderResultMap['mermaid']>;
  renderTypstSvg?: (
    request: PreviewRenderRequestMap['typst']
  ) => Promise<PreviewRenderResultMap['typst']>;
};

type DesktopPreviewApis = {
  preview?: DesktopPreviewHandlers;
};

function getDesktopPreviewHandlers() {
  const previewApis = apis as unknown as DesktopPreviewApis;
  return previewApis.preview ?? null;
}

function getRequiredDesktopHandler<Name extends keyof DesktopPreviewHandlers>(
  name: Name
): NonNullable<DesktopPreviewHandlers[Name]> {
  const handlers = getDesktopPreviewHandlers();
  const handler = handlers?.[name];
  if (!handler) {
    throw new Error(
      `Electron preview handler "${String(name)}" is unavailable.`
    );
  }
  return handler as NonNullable<DesktopPreviewHandlers[Name]>;
}

export async function renderMermaidSvgBackend(
  request: PreviewRenderRequestMap['mermaid']
): Promise<PreviewRenderResultMap['mermaid']> {
  if (!isMermaidWasmNativeRendererEnabled()) {
    return renderClassicMermaidSvg(request);
  }

  return getRequiredDesktopHandler('renderMermaidSvg')(request);
}

export async function renderTypstSvgBackend(
  request: PreviewRenderRequestMap['typst']
): Promise<PreviewRenderResultMap['typst']> {
  return getRequiredDesktopHandler('renderTypstSvg')(request);
}
