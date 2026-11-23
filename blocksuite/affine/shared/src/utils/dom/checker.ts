import type { EditorHost } from '@blocksuite/std';

export function isInsidePageEditor(host?: EditorHost) {
  if (!host) return false;
  return Array.from(host.children).some(
    v => v.tagName.toLowerCase() === 'affine-page-root'
  );
}

export function isInsideEdgelessEditor(host?: EditorHost) {
  if (!host) return false;

  return Array.from(host.children).some(
    v =>
      v.tagName.toLowerCase() === 'affine-edgeless-root' ||
      v.tagName.toLowerCase() === 'affine-edgeless-root-preview'
  );
}
