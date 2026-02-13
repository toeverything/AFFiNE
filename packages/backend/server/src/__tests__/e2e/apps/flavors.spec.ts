import { getCurrentUserQuery } from '@affine/graphql';

import { JobExecutor } from '../../../base/job/queue/executor';
import { DatabaseDocReader, DocReader } from '../../../core/doc';
import { createApp } from '../create-app';
import { e2e } from '../test';

type TestFlavor = 'doc' | 'graphql' | 'sync' | 'renderer' | 'front';

const createFlavorApp = async (flavor: TestFlavor) => {
  // @ts-expect-error override
  globalThis.env.FLAVOR = flavor;
  return await createApp({
    tapModule(module) {
      module.overrideProvider(JobExecutor).useValue({
        onConfigInit: async () => {},
        onConfigChanged: async () => {},
        onModuleDestroy: async () => {},
      });
    },
  });
};

e2e('should init doc service', async t => {
  await using app = await createFlavorApp('doc');

  const res = await app.GET('/info').expect(200);
  t.is(res.body.flavor, 'doc');

  await t.throwsAsync(app.gql({ query: getCurrentUserQuery }));
});

e2e('should init graphql service', async t => {
  await using app = await createFlavorApp('graphql');

  const res = await app.GET('/info').expect(200);

  t.is(res.body.flavor, 'graphql');

  const user = await app.gql({ query: getCurrentUserQuery });
  t.is(user.currentUser, null);
});

e2e('should init sync service', async t => {
  await using app = await createFlavorApp('sync');

  const res = await app.GET('/info').expect(200);
  t.is(res.body.flavor, 'sync');
});

e2e('should init renderer service', async t => {
  await using app = await createFlavorApp('renderer');

  const res = await app.GET('/info').expect(200);
  t.is(res.body.flavor, 'renderer');
});

e2e('should init front service', async t => {
  await using app = await createFlavorApp('front');

  const res = await app.GET('/info').expect(200);
  t.is(res.body.flavor, 'front');

  const docReader = app.get(DocReader);
  t.true(docReader instanceof DatabaseDocReader);
});
