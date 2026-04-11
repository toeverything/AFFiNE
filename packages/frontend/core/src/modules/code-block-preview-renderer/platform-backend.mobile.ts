import { getNativePreviewHandlers } from './runtime-config';
import type { PreviewRenderRequestMap, PreviewRenderResultMap } from './types';

function getRequiredNativeHandler<
  Name extends keyof NonNullable<ReturnType<typeof getNativePreviewHandlers>>,
>(name: Name) {
  const handler = getNativePreviewHandlers()?.[name];
  if (!handler) {
    throw new Error(`Mobile preview handler "${String(name)}" is unavailable.`);
  }
  return handler;
}

export async function renderMermaidSvgBackend(
  request: PreviewRenderRequestMap['mermaid']
): Promise<PreviewRenderResultMap['mermaid']> {
  return getRequiredNativeHandler('renderMermaidSvg')(request);
}

export async function renderTypstSvgBackend(
  request: PreviewRenderRequestMap['typst']
): Promise<PreviewRenderResultMap['typst']> {
  return getRequiredNativeHandler('renderTypstSvg')(request);
}
