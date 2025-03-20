import test from 'ava';

import { Renderers } from '../mails';

test('should render emails', async t => {
  for (const render of Object.values(Renderers)) {
    // @ts-expect-error use [PreviewProps]
    const content = await render();
    t.snapshot(content.html, content.subject);
  }
});
