import { oauthProvidersQuery } from '@affine/graphql';

import { ConfigModule } from '../../../base/config';
import { createApp, e2e, TestingApp } from '../test';

let app: TestingApp;

e2e.before(async () => {
  app = await createApp({
    imports: [
      ConfigModule.override({
        oauth: {
          providers: {
            apple: {
              clientId: 'test',
              clientSecret: 'test',
              args: {
                redirectUri: 'test',
              },
            },
            google: {
              clientId: 'test',
              clientSecret: 'test',
              args: {
                redirectUri: 'test',
              },
            },
          },
        },
      }),
    ],
  });
});

e2e.after.always(async () => {
  await app.close();
});

e2e('should return apple oauth provider in version >= 0.22.0', async t => {
  const res = await app.gql({
    query: oauthProvidersQuery,
    context: {
      headers: {
        'x-affine-version': '0.22.0',
      },
    },
  });
  t.snapshot(res);

  const res2 = await app.gql({
    query: oauthProvidersQuery,
    context: {
      headers: {
        'x-affine-version': '0.23.0-beta.1',
      },
    },
  });

  t.snapshot(res2);

  const res3 = await app.gql({
    query: oauthProvidersQuery,
    context: {
      headers: {
        'x-affine-version': '2025.6.29-canary.93',
      },
    },
  });

  t.snapshot(res3);
});

e2e(
  'should not return apple oauth provider when client version is not specified',
  async t => {
    const res = await app.gql({
      query: oauthProvidersQuery,
    });

    t.snapshot(res);
  }
);

e2e('should not return apple oauth provider in version < 0.22.0', async t => {
  const res = await app.gql({
    query: oauthProvidersQuery,
    context: {
      headers: {
        'x-affine-version': '0.21.0',
      },
    },
  });

  t.snapshot(res);
});

e2e(
  'should not return apple oauth provider when client version format is not correct',
  async t => {
    const res = await app.gql({
      query: oauthProvidersQuery,
      context: {
        headers: {
          'x-affine-version': 'mock-invalid-version',
        },
      },
    });

    t.snapshot(res);
  }
);
