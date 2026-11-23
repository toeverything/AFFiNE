import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const themeDir = fileURLToPath(new URL('..', import.meta.url));

function readSlntMin(fontPath: string) {
  const font = readFileSync(fontPath);
  const numTables = font.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (font.toString('latin1', record, record + 4) !== 'fvar') continue;
    const fvar = font.readUInt32BE(record + 8);
    const axesOffset = fvar + font.readUInt16BE(fvar + 4);
    const axisCount = font.readUInt16BE(fvar + 8);
    const axisSize = font.readUInt16BE(fvar + 10);
    for (let j = 0; j < axisCount; j++) {
      const axis = axesOffset + j * axisSize;
      if (font.toString('latin1', axis, axis + 4) === 'slnt') {
        return font.readInt32BE(axis + 4) / 0x10000;
      }
    }
  }
  return null;
}

test('Inter italic face uses the strongest slant of the variable font', () => {
  const css = readFileSync(`${themeDir}/fonts.css`, 'utf8');
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)]
    .map(([, body]) => body)
    .filter(body => body.includes("font-family: 'Inter'"));
  const italic = faces.find(body => body.includes('font-style: italic'));
  const src = italic?.match(/src: url\(([^)]*)\)/)?.[1];
  expect(faces.some(body => body.includes('font-style: normal'))).toBe(true);
  expect(src).toBeDefined();
  expect(italic).toContain(
    `font-variation-settings: 'slnt' ${readSlntMin(`${themeDir}/${src}`)};`
  );
});
