import ava from 'ava';

import { verifyEmailDomainRecords } from '../../core/auth/email-domain';

const test = ava;

test('should verify email domain records', async t => {
  const ok = await verifyEmailDomainRecords(
    'user@example.com',
    {
      resolveMx: async () => [{ exchange: 'mx.example.com', priority: 10 }],
      resolveTxt: async domain =>
        domain === '_dmarc.example.com'
          ? [['v=DMARC1; p=none']]
          : [['v=spf1 include:_spf.example.com ~all']],
    },
    100
  );

  t.true(ok);
});

test('should verify split txt record chunks', async t => {
  const ok = await verifyEmailDomainRecords(
    'user@example.com',
    {
      resolveMx: async () => [{ exchange: 'mx.example.com', priority: 10 }],
      resolveTxt: async domain =>
        domain === '_dmarc.example.com'
          ? [['v=DM', 'ARC1; p=none']]
          : [['v=spf', '1 include:_spf.example.com ~all']],
    },
    100
  );

  t.true(ok);
});

test('should fail closed when email domain lookup times out', async t => {
  const ok = await verifyEmailDomainRecords(
    'user@example.com',
    {
      resolveMx: async () =>
        new Promise(resolve =>
          setTimeout(
            () => resolve([{ exchange: 'mx.example.com', priority: 10 }]),
            50
          )
        ),
      resolveTxt: async () => [['v=spf1 include:_spf.example.com ~all']],
    },
    1
  );

  t.false(ok);
});
