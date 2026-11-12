import type { AttachmentBlockModel } from '@blocksuite/affine-model';

/**
 * draw.io in embed mode, see https://www.drawio.com/doc/faq/embed-mode.
 * Self-hosted deployments can point the embed at their own draw.io server
 * with `AttachmentDrawioEmbedUrlExtension`.
 */
export const DEFAULT_DRAWIO_EMBED_URL = 'https://embed.diagrams.net/';

export const DRAWIO_MIME_TYPE = 'application/vnd.jgraph.mxfile';

// `.drawio.svg` and `.drawio.png` exports are regular images and are handled
// by the image embed, so only the XML formats are matched here.
const DRAWIO_EXTENSIONS = ['.drawio', '.dio', '.drawio.xml'];

export const isDrawioFileName = (name: string) => {
  const lower = name.trim().toLowerCase();
  return DRAWIO_EXTENSIONS.some(ext => lower.endsWith(ext));
};

export const isDrawioAttachment = (model: AttachmentBlockModel) =>
  model.props.type === DRAWIO_MIME_TYPE || isDrawioFileName(model.props.name);

/**
 * Checks the complete file content before sending it to the viewer, so we don't
 * send arbitrary or malformed files to the viewer.
 */
export const isDrawioXml = (content: string) => {
  const document = new DOMParser().parseFromString(content, 'application/xml');
  const root = document.documentElement;
  return (
    root != null &&
    root.localName !== 'parsererror' &&
    document.getElementsByTagName('parsererror').length === 0 &&
    (root.localName === 'mxfile' || root.localName === 'mxGraphModel')
  );
};

/**
 * Builds the iframe url for a read-only draw.io viewer that receives the
 * diagram through `postMessage`, so the diagram is never part of a url.
 */
export const buildDrawioViewerUrl = (baseUrl: string) => {
  const url = new URL(baseUrl);
  url.searchParams.set('embed', '1');
  url.searchParams.set('proto', 'json');
  // chromeless, read-only viewer
  url.searchParams.set('chrome', '0');
  url.searchParams.set('spin', '1');
  url.searchParams.set('noSaveBtn', '1');
  url.searchParams.set('noExitBtn', '1');
  return url.toString();
};

export type DrawioMessage = { event: string; [key: string]: unknown };

export const parseDrawioMessage = (data: unknown): DrawioMessage | null => {
  if (typeof data !== 'string') return null;
  try {
    const message: unknown = JSON.parse(data);
    if (
      message &&
      typeof message === 'object' &&
      typeof (message as DrawioMessage).event === 'string'
    ) {
      return message as DrawioMessage;
    }
  } catch {
    // not a draw.io message
  }
  return null;
};
