import { serverConfigQuery, ServerFeature } from '@affine/graphql';

import { app, e2e } from '../test';

e2e('should indexer feature enabled by default', async t => {
  const { serverConfig } = await app.gql({ query: serverConfigQuery });

  t.is(
    serverConfig.features.includes(ServerFeature.Indexer),
    true,
    JSON.stringify(serverConfig, null, 2)
  );
});

e2e('should comment feature enabled by default', async t => {
  const { serverConfig } = await app.gql({ query: serverConfigQuery });

  t.is(
    serverConfig.features.includes(ServerFeature.Comment),
    true,
    JSON.stringify(serverConfig, null, 2)
  );
});

e2e('should enable local workspace feature by default', async t => {
  const { serverConfig } = await app.gql({ query: serverConfigQuery });

  t.is(
    serverConfig.features.includes(ServerFeature.LocalWorkspace),
    true,
    JSON.stringify(serverConfig, null, 2)
  );
});
