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
