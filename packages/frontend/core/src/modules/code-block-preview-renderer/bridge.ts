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
import type { Config } from 'dompurify';
import DOMPurify from 'dompurify';

/** Mermaid SVG uses `<use>`, `<style>`, and sometimes `<foreignObject>` for labels. */
const MERMAID_SVG_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { svg: true },
  ADD_TAGS: ['use'],
  ADD_ATTR: ['href', 'xlink:href', 'class', 'style', 'id'],
};

const FOREIGN_OBJECT_HTML_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true },
};

function sanitizeForeignObjects(root: ParentNode) {
  root.querySelectorAll('foreignObject, foreignobject').forEach(element => {
    element.innerHTML = DOMPurify.sanitize(
      element.innerHTML,
      FOREIGN_OBJECT_HTML_SANITIZE_CONFIG
    );
  });
}

export function sanitizeSvg(svg: string): string {
  if (
    typeof DOMParser === 'undefined' ||
    typeof XMLSerializer === 'undefined'
  ) {
    const sanitized = DOMPurify.sanitize(svg, MERMAID_SVG_SANITIZE_CONFIG);
    if (typeof sanitized !== 'string' || !/^\s*<svg[\s>]/i.test(sanitized)) {
      return '';
    }
    return sanitized.trim();
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') return '';

  const sanitized = DOMPurify.sanitize(root, MERMAID_SVG_SANITIZE_CONFIG);
  if (typeof sanitized !== 'string') return '';

  const sanitizedDoc = parser.parseFromString(sanitized, 'image/svg+xml');
  const sanitizedRoot = sanitizedDoc.documentElement;
  if (!sanitizedRoot || sanitizedRoot.tagName.toLowerCase() !== 'svg')
    return '';

  sanitizeForeignObjects(sanitizedRoot);
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
