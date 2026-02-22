import {
  getMermaidRenderer,
  type MermaidRenderRequest,
  type MermaidRenderResult,
} from '@affine/core/modules/mermaid/renderer';
import {
  getTypstRenderer,
  type TypstRenderRequest,
  type TypstRenderResult,
} from '@affine/core/modules/typst/renderer';
import { apis } from '@affine/electron-api';
import DOMPurify from 'dompurify';

function removeForeignObject(root: ParentNode) {
  root
    .querySelectorAll('foreignObject, foreignobject')
    .forEach(element => element.remove());
}

export function sanitizeSvg(svg: string): string {
  if (
    typeof DOMParser === 'undefined' ||
    typeof XMLSerializer === 'undefined'
  ) {
    const sanitized = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });
    if (typeof sanitized !== 'string' || !/^\s*<svg[\s>]/i.test(sanitized)) {
      return '';
    }
    return sanitized.trim();
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') return '';

  const sanitized = DOMPurify.sanitize(root, { USE_PROFILES: { svg: true } });
  if (typeof sanitized !== 'string') return '';

  const sanitizedDoc = parser.parseFromString(sanitized, 'image/svg+xml');
  const sanitizedRoot = sanitizedDoc.documentElement;
  if (!sanitizedRoot || sanitizedRoot.tagName.toLowerCase() !== 'svg')
    return '';

  removeForeignObject(sanitizedRoot);
  return new XMLSerializer().serializeToString(sanitizedRoot).trim();
}

type DesktopPreviewHandlers = {
  renderMermaidSvg?: (
    request: MermaidRenderRequest
  ) => Promise<MermaidRenderResult>;
  renderTypstSvg?: (request: TypstRenderRequest) => Promise<TypstRenderResult>;
};

type DesktopPreviewApis = {
  preview?: DesktopPreviewHandlers;
};

function getDesktopPreviewHandlers() {
  if (!BUILD_CONFIG.isElectron || !apis) return null;

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

export async function renderMermaidSvg(
  request: MermaidRenderRequest
): Promise<MermaidRenderResult> {
  const rendered = BUILD_CONFIG.isElectron
    ? await getRequiredDesktopHandler('renderMermaidSvg')(request)
    : await getMermaidRenderer().render(request);

  const sanitizedSvg = sanitizeSvg(rendered.svg);
  if (!sanitizedSvg) {
    throw new Error('Preview renderer returned invalid SVG.');
  }
  return { svg: sanitizedSvg };
}

export async function renderTypstSvg(
  request: TypstRenderRequest
): Promise<TypstRenderResult> {
  const rendered = BUILD_CONFIG.isElectron
    ? await getRequiredDesktopHandler('renderTypstSvg')(request)
    : await getTypstRenderer().render(request);

  return { svg: rendered.svg };
}
