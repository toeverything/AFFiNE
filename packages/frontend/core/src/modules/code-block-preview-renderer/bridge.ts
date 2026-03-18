import {
  renderMermaidSvgBackend,
  renderTypstSvgBackend,
} from '@affine/core/modules/code-block-preview-renderer/platform-backend';
import type {
  MermaidRenderRequest,
  MermaidRenderResult,
} from '@affine/core/modules/mermaid/renderer';
import type {
  TypstRenderRequest,
  TypstRenderResult,
} from '@affine/core/modules/typst/renderer';
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

export async function renderMermaidSvg(
  request: MermaidRenderRequest
): Promise<MermaidRenderResult> {
  const rendered = await renderMermaidSvgBackend(request);

  const sanitizedSvg = sanitizeSvg(rendered.svg);
  if (!sanitizedSvg) {
    throw new Error('Preview renderer returned invalid SVG.');
  }
  return { svg: sanitizedSvg };
}

export async function renderTypstSvg(
  request: TypstRenderRequest
): Promise<TypstRenderResult> {
  const rendered = await renderTypstSvgBackend(request);

  return { svg: rendered.svg };
}
