import { describe, expect, it } from 'vitest';

import { parseMiroCsv } from './miro-csv';

describe('Miro CSV research import', () => {
  it('maps title and xy when columns exist', () => {
    expect(
      parseMiroCsv(`title,type,x,y,width,height
Sticky,sticker,10,20,80,80
`)
    ).toEqual([
      { title: 'Sticky', type: 'sticker', x: 10, y: 20, w: 80, h: 80 },
    ]);
  });
});
