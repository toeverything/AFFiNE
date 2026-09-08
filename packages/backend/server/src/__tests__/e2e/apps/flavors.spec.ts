import { getCurrentUserQuery } from '@affine/graphql';

import { JobExecutor } from '../../../base/job/queue/executor';
import { DatabaseDocReader, DocReader } from '../../../core/doc';
import { RealtimeGateway } from '../../../core/realtime/gateway';
import { createApp } from '../create-app';
import { e2e } from '../test';

type TestFlavor =
  | 'allinone'
  | 'worker'
  | 'graphql'
  | 'sync'
  | 'renderer'
  | 'front';

const withFlavor = async <T>(
  flavor: TestFlavor,
  run: (app: Awaited<ReturnType<typeof createApp>>) => Promise<T>
) => {
  const mutableEnv = globalThis.env as unknown as { FLAVOR: string };
  const previousFlavor = mutableEnv.FLAVOR;
  // @ts-expect-error override
  globalThis.env.FLAVOR = flavor;
  try {
    await using app = await createApp({
      tapModule(module) {
        module.overrideProvider(JobExecutor).useValue({
          onConfigInit: async () => {},
          onConfigChanged: async () => {},
          onModuleDestroy: async () => {},
        });
      },
    });
    return await run(app);
  } finally {
    mutableEnv.FLAVOR = previousFlavor;
  }
};

e2e('should init worker service', async t => {
  await withFlavor('worker', async app => {
    const res = await app.GET('/info').expect(200);
    t.is(res.body.flavor, 'worker');
    t.throws(() => app.get(RealtimeGateway));

    await t.throwsAsync(app.gql({ query: getCurrentUserQuery }));
    await app.PUT('/api/storage/upload').expect(404);
  });
});

e2e('should init allinone service with worker handlers', async t => {
  await withFlavor('allinone', async app => {
    const res = await app.GET('/info').expect(200);
    t.is(res.body.flavor, 'allinone');
  });
});

e2e('should init graphql service', async t => {
  await withFlavor('graphql', async app => {
    const res = await app.GET('/info').expect(200);

    t.is(res.body.flavor, 'graphql');

    const user = await app.gql({ query: getCurrentUserQuery });
    t.is(user.currentUser, null);
    t.truthy(app.get(RealtimeGateway));
  });
});

e2e('should init sync service', async t => {
  await withFlavor('sync', async app => {
    const res = await app.GET('/info').expect(200);
    t.is(res.body.flavor, 'sync');
  });
});

e2e('should init renderer service', async t => {
  await withFlavor('renderer', async app => {
    const res = await app.GET('/info').expect(200);
    t.is(res.body.flavor, 'renderer');
  });
});

e2e('should init front service', async t => {
  await withFlavor('front', async app => {
    const res = await app.GET('/info').expect(200);
    t.is(res.body.flavor, 'front');

    const docReader = app.get(DocReader);
    t.true(docReader instanceof DatabaseDocReader);
  });
});
