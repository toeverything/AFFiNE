import { describe, expect, it } from 'vitest';

import {
  importWhiteboardFile,
  sniffWhiteboardFormat,
  type WhiteboardImportFile,
} from './import';

function file(name: string, text: string): WhiteboardImportFile {
  return { name, text: () => Promise.resolve(text) };
}

const DRAWIO = `<mxfile><diagram><mxGraphModel><root>
<mxCell id="2" value="Box" vertex="1"><mxGeometry x="10" y="20" width="80" height="40"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const MIRO_CSV = `title,type,x,y\nSticky,sticker,10,20\n`;

describe('whiteboard file import', () => {
  it('sniffs the format from the extension', () => {
    expect(sniffWhiteboardFormat('board.excalidraw')).toBe('excalidraw');
    expect(sniffWhiteboardFormat('Board.JSON')).toBe('excalidraw');
    expect(sniffWhiteboardFormat('flow.drawio')).toBe('drawio');
    expect(sniffWhiteboardFormat('flow.xml')).toBe('drawio');
    expect(sniffWhiteboardFormat('board.csv')).toBe('miro-csv');
    expect(sniffWhiteboardFormat('sketch.png')).toBeUndefined();
    expect(sniffWhiteboardFormat('noextension')).toBeUndefined();
  });

  it('dispatches to the matching parser', async () => {
    const scene = '{"type":"excalidraw","elements":[]}';
    await expect(
      importWhiteboardFile({}, file('board.excalidraw', scene))
    ).resolves.toEqual({ format: 'excalidraw', json: scene });

    await expect(
      importWhiteboardFile({}, file('flow.drawio', DRAWIO))
    ).resolves.toEqual({
      format: 'drawio',
      shapes: [{ id: '2', label: 'Box', x: 10, y: 20, w: 80, h: 40 }],
    });

    await expect(
      importWhiteboardFile({}, file('board.csv', MIRO_CSV))
    ).resolves.toEqual({
      format: 'miro-csv',
      rows: [{ title: 'Sticky', type: 'sticker', x: 10, y: 20 }],
    });
  });

  it('skips unknown formats, empty payloads and readonly docs', async () => {
    await expect(
      importWhiteboardFile({}, file('sketch.png', 'binary'))
    ).resolves.toBeUndefined();
    await expect(
      importWhiteboardFile({}, file('flow.xml', '<mxfile></mxfile>'))
    ).resolves.toBeUndefined();
    await expect(
      importWhiteboardFile({}, file('board.csv', 'title,x\n'))
    ).resolves.toBeUndefined();
    await expect(
      importWhiteboardFile({ readonly: true }, file('board.excalidraw', '{}'))
    ).resolves.toBeUndefined();
  });
});
