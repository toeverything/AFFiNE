import test from 'ava';

import { normalizeSMTPHeloHostname } from '../core/mail/utils';
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

test('should normalize valid SMTP HELO hostnames', t => {
  t.is(normalizeSMTPHeloHostname('mail.example.com'), 'mail.example.com');
  t.is(normalizeSMTPHeloHostname(' localhost '), 'localhost');
  t.is(normalizeSMTPHeloHostname('[127.0.0.1]'), '[127.0.0.1]');
  t.is(normalizeSMTPHeloHostname('[IPv6:2001:db8::1]'), '[IPv6:2001:db8::1]');
});

test('should reject invalid SMTP HELO hostnames', t => {
  t.is(normalizeSMTPHeloHostname(''), undefined);
  t.is(normalizeSMTPHeloHostname('  '), undefined);
  t.is(normalizeSMTPHeloHostname('AFFiNE Server'), undefined);
  t.is(normalizeSMTPHeloHostname('-example.com'), undefined);
  t.is(normalizeSMTPHeloHostname('example-.com'), undefined);
  t.is(normalizeSMTPHeloHostname('example..com'), undefined);
  t.is(normalizeSMTPHeloHostname('[bad host]'), undefined);
  t.is(normalizeSMTPHeloHostname('[foo]'), undefined);
  t.is(normalizeSMTPHeloHostname('[IPv6:foo]'), undefined);
});
