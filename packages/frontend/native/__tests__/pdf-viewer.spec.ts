import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createJimp } from '@jimp/core';
import png from '@jimp/js-png';
import { assert, describe, expect, test } from 'vitest';

import { Viewer } from '../index';

const Jimp = createJimp({ formats: [png] });

describe('pdf viewer', () => {
  test('basic info', async () => {
    const viewer = new Viewer();

    const filepath = fileURLToPath(
      new URL('./fixtures/pdf/lorem-ipsum.pdf', import.meta.url)
    );
    const bytes = await readFile(filepath);
    const id = '0';

    const doc = viewer.open(id, bytes);
    assert(doc);

    expect(doc.version()).toBe('pdf1_3');

    const metadata = doc.metadata();
    expect(metadata.title).toBe('lorem ipsum');
    expect(metadata.creator).toBe('Pages');
    expect(metadata.producer).toMatch('Quartz PDFContext');

    const pages = doc.pages();
    expect(pages.len()).toBe(3);

    const closed = viewer.close(id);
    expect(closed).toBe(true);

    const closed2 = viewer.close(id);
    expect(closed2).toBe(false);

    const doc2 = viewer.openWithId(id);
    expect(doc2).toBeNull();
  });

  test('minimal', async () => {
    const viewer = new Viewer();

    const filepath = fileURLToPath(
      new URL('./fixtures/pdf/minimal.pdf', import.meta.url)
    );
    const bytes = await readFile(filepath);
    const id = '0';

    const doc = viewer.open(id, bytes);
    assert(doc);

    const pages = doc.pages();
    expect(pages.len()).toBe(1);

    const page = pages.get(0);
    assert(page);
    expect(page.text().length).gt(0);

    expect(page.isPortrait()).toBe(true);

    const rect = page.rect();
    const width = rect.width();
    const height = rect.height();
    const data = page.render(width, height);
    assert(data);

    const image = await Jimp.read(
      fileURLToPath(new URL('./fixtures/pdf/minimal.png', import.meta.url))
    );
    expect(data.buffer.byteLength).toBe(image.bitmap.data.byteLength);

    const doc2 = viewer.openWithId(id);
    assert(doc2);

    const pages2 = doc2.pages();
    expect(pages2.len()).toBe(1);

    const page2 = pages2.get(0);
    assert(page2);

    const imageData = page2.renderWithScale(2);
    assert(imageData);

    const image2 = await Jimp.read(
      fileURLToPath(new URL('./fixtures/pdf/minimal@2x.png', import.meta.url))
    );

    expect(imageData.data.buffer.slice(0, 100)).toStrictEqual(
      image2.bitmap.data.buffer.slice(0, 100)
    );
    expect(imageData.data.buffer.byteLength).toBe(
      image2.bitmap.data.byteLength
    );
    expect(
      imageData.data.buffer.slice(imageData.data.buffer.byteLength - 100)
    ).toStrictEqual(
      image2.bitmap.data.buffer.slice(imageData.data.buffer.byteLength - 100)
    );
    expect(imageData.width).toBeCloseTo(width * 2, 0.1);
    expect(imageData.height).toBeCloseTo(height * 2, 0.1);
  });
});
