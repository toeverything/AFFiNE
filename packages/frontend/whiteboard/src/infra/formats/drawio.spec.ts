import { describe, expect, it } from 'vitest';

import { parseDrawioXmlLite } from './drawio';

describe('draw.io XML import', () => {
  it('reads vertex geometry', () => {
    const shapes = parseDrawioXmlLite(`
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="n1" value="Note" vertex="1" style="rounded=1">
  <mxGeometry x="12" y="24" width="80" height="40" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`);
    expect(shapes).toEqual([
      { id: 'n1', label: 'Note', x: 12, y: 24, w: 80, h: 40 },
    ]);
  });
});
