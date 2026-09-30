import type { AttachmentBlockModel } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

import {
  buildDrawioViewerUrl,
  DRAWIO_MIME_TYPE,
  isDrawioAttachment,
  isDrawioFileName,
  isDrawioXml,
  parseDrawioMessage,
} from '../drawio/utils';

const attachment = (name: string, type = 'application/octet-stream') =>
  ({ props: { name, type } }) as AttachmentBlockModel;

describe('draw.io attachments', () => {
  it('detects draw.io files by name', () => {
    expect(isDrawioFileName('flow.drawio')).toBe(true);
    expect(isDrawioFileName('FLOW.DRAWIO ')).toBe(true);
    expect(isDrawioFileName('flow.dio')).toBe(true);
    expect(isDrawioFileName('flow.drawio.xml')).toBe(true);
    // exports with an embedded diagram are shown as images
    expect(isDrawioFileName('flow.drawio.svg')).toBe(false);
    expect(isDrawioFileName('flow.drawio.png')).toBe(false);
    expect(isDrawioFileName('flow.xml')).toBe(false);
    expect(isDrawioFileName('drawio')).toBe(false);
  });

  it('detects draw.io files by mime type', () => {
    expect(isDrawioAttachment(attachment('flow', DRAWIO_MIME_TYPE))).toBe(true);
    expect(isDrawioAttachment(attachment('flow.drawio'))).toBe(true);
    expect(isDrawioAttachment(attachment('flow.pdf', 'application/pdf'))).toBe(
      false
    );
  });

  it('checks the file content', () => {
    expect(
      isDrawioXml(
        '<mxfile host="app.diagrams.net"><diagram id="a">x</diagram></mxfile>'
      )
    ).toBe(true);
    expect(
      isDrawioXml(
        '<?xml version="1.0" encoding="UTF-8"?>\n<!-- exported -->\n<mxfile>'
      )
    ).toBe(true);
    expect(isDrawioXml('  <mxGraphModel dx="1"><root/></mxGraphModel>')).toBe(
      true
    );
    expect(isDrawioXml('<mxfiles>')).toBe(false);
    expect(isDrawioXml('<html><body><mxfile></mxfile></body></html>')).toBe(
      false
    );
    expect(isDrawioXml('not xml')).toBe(false);
  });

  it('builds a read-only embed url', () => {
    const url = new URL(
      buildDrawioViewerUrl('https://drawio.example.com/app/?lang=de')
    );
    expect(url.origin).toBe('https://drawio.example.com');
    expect(url.pathname).toBe('/app/');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      lang: 'de',
      embed: '1',
      proto: 'json',
      chrome: '0',
    });
  });

  it('parses messages from the viewer', () => {
    expect(parseDrawioMessage('{"event":"init"}')).toEqual({ event: 'init' });
    expect(parseDrawioMessage('{"action":"load"}')).toBe(null);
    expect(parseDrawioMessage('not json')).toBe(null);
    expect(parseDrawioMessage({ event: 'init' })).toBe(null);
    expect(parseDrawioMessage('null')).toBe(null);
  });
});
