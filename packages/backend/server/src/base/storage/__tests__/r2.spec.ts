import test from 'ava';

import { R2StorageProvider } from '../providers/r2';

function endpointOf(provider: R2StorageProvider) {
  return provider.endpointUrl;
}

test('R2 provider should use account endpoint by default', t => {
  const provider = new R2StorageProvider(
    {
      accountId: 'test-account',
      region: 'auto',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    },
    'test-bucket'
  );

  t.is(
    endpointOf(provider),
    'https://test-account.r2.cloudflarestorage.com/test-bucket'
  );
});

test('R2 provider should append jurisdiction suffix for EU buckets', t => {
  const provider = new R2StorageProvider(
    {
      accountId: 'test-account',
      jurisdiction: 'eu',
      region: 'auto',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    },
    'test-bucket'
  );

  t.is(
    endpointOf(provider),
    'https://test-account.eu.r2.cloudflarestorage.com/test-bucket'
  );
});

test('R2 provider should throw when accountId is missing', t => {
  t.throws(
    () =>
      new R2StorageProvider(
        {
          region: 'auto',
          credentials: {
            accessKeyId: 'test',
            secretAccessKey: 'test',
          },
        } as any,
        'test-bucket'
      )
  );
});

test('R2 provider should use default endpoint when jurisdiction is explicitly undefined', t => {
  const provider = new R2StorageProvider(
    {
      accountId: 'test-account',
      jurisdiction: undefined,
      region: 'auto',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    },
    'test-bucket'
  );

  t.is(
    endpointOf(provider),
    'https://test-account.r2.cloudflarestorage.com/test-bucket'
  );
});
