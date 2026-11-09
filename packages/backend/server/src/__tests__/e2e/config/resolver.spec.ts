import {
  getCopilotRouteOptionsQuery,
  serverConfigQuery,
  ServerFeature,
} from '@affine/graphql';
import { Prisma, PrismaClient } from '@prisma/client';

import { InvalidAppConfigInput } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { ServerService } from '../../../core/config';
import { app, e2e } from '../test';

e2e('should expose the indexer feature when it is enabled', async t => {
  const enabled = app.get(BackendRuntimeProvider).searchEnabled();
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

e2e(
  'managed model choices follow the active configuration snapshot',
  async t => {
    const user = await app.signup();
    const service = app.get(ServerService);
    const db = app.get(PrismaClient);
    const previousProfiles = await app.models.appConfig.get(
      'copilot.providers.profiles'
    );
    const previousEnabled = await app.models.appConfig.get('copilot.enabled');
    t.teardown(async () => {
      if (previousProfiles) {
        await db.appConfig.upsert({
          where: { id: 'copilot.providers.profiles' },
          create: {
            id: 'copilot.providers.profiles',
            value: previousProfiles.value ?? Prisma.JsonNull,
          },
          update: { value: previousProfiles.value ?? Prisma.JsonNull },
        });
      } else {
        await service.updateConfig(user.id, [
          { module: 'copilot', key: 'providers.profiles', clear: true },
        ]);
      }
      await service.updateConfig(user.id, [
        previousEnabled
          ? { module: 'copilot', key: 'enabled', value: previousEnabled.value }
          : { module: 'copilot', key: 'enabled', clear: true },
      ]);
    });
    for (const { profiles, choices, defaultTargetId } of [
      {
        profiles: [
          {
            id: 'official',
            type: 'openai',
            models: ['gpt-5.6-luna'],
            config: { apiKey: 'test-key' },
          },
        ],
        choices: [
          { id: 'luna', available: true },
          { id: 'terra', available: false },
        ],
        defaultTargetId: 'luna',
      },
      {
        profiles: [
          {
            id: 'google',
            type: 'gemini',
            models: ['gemini-3.7-flash'],
            config: { apiKey: 'test-key' },
          },
        ],
        choices: [{ id: 'gemini', available: false }],
        defaultTargetId: null,
      },
      { profiles: [], choices: [], defaultTargetId: null },
    ]) {
      const error = await t.throwsAsync(
        service.updateConfig(user.id, [
          { module: 'copilot', key: 'providers.profiles', value: profiles },
        ]),
        { instanceOf: InvalidAppConfigInput }
      );
      t.regex(error.message, /deployment configuration/);
      // Seed a pre-existing override to verify the shared configuration remains readable.
      await db.appConfig.upsert({
        where: { id: 'copilot.providers.profiles' },
        create: { id: 'copilot.providers.profiles', value: profiles },
        update: { value: profiles },
      });
      await service.updateConfig(user.id, [
        { module: 'copilot', key: 'enabled', value: true },
      ]);
      t.deepEqual(
        (await app.models.appConfig.get('copilot.providers.profiles'))?.value,
        profiles
      );
      const { currentUser } = await app.gql({
        query: getCopilotRouteOptionsQuery,
        variables: { promptName: 'Chat With AFFiNE AI' },
      });
      const options = currentUser?.copilot?.routeOptions;
      t.truthy(options);
      t.is(options?.defaultTargetId, defaultTargetId);
      t.deepEqual(
        options?.choices.map(({ id, available }) => ({ id, available })),
        choices
      );
    }
  }
);
