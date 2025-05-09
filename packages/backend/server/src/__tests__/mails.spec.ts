import test from 'ava';

import { Renderers } from '../mails';
import { TEST_DOC, TEST_USER } from '../mails/common';

test('should render emails', async t => {
  for (const render of Object.values(Renderers)) {
    // @ts-expect-error use [PreviewProps]
    const content = await render();
    t.snapshot(content.html, content.subject);
  }
});

test('should render mention email with empty doc title', async t => {
  const content = await Renderers.Mention({
    user: TEST_USER,
    doc: {
      ...TEST_DOC,
      title: '',
    },
  });
  t.snapshot(content.html, content.subject);
});
