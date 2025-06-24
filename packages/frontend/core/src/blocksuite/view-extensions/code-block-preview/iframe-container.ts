import type { CodeBlockModel } from '@blocksuite/affine/model';

export function linkIframe(iframe: HTMLIFrameElement, model: CodeBlockModel) {
  const html = model.props.text.toString();
  iframe.srcdoc = html;
  iframe.sandbox.add('allow-scripts', 'allow-same-origin');
}
