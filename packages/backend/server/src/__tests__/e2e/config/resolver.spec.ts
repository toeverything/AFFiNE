import { serverConfigQuery, ServerFeature } from '@affine/graphql';

import { Config } from '../../../base';
import { app, e2e } from '../test';

e2e('should expose the indexer feature when it is enabled', async t => {
  const enabled = app.get(Config).indexer.enabled;
  const { serverConfig } = await app.gql({ query: serverConfigQuery });

  t.is(
    serverConfig.features.includes(ServerFeature.Indexer),
    enabled,
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
