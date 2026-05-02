import test from 'ava';

import { summarizePreparedRoutes } from '../../plugins/copilot/runtime/execution-metrics';

test('summarizePreparedRoutes should report none when no route is prepared', t => {
  t.deepEqual(
    summarizePreparedRoutes([{ prepared: undefined }, { prepared: undefined }]),
    {
      routeCount: 2,
      preparedCount: 0,
      preparedMode: 'none',
    }
  );
});

test('summarizePreparedRoutes should report partial when only some routes are prepared', t => {
  t.deepEqual(
    summarizePreparedRoutes([
      { prepared: { route: {} } as never },
      { prepared: undefined },
    ]),
    {
      routeCount: 2,
      preparedCount: 1,
      preparedMode: 'partial',
    }
  );
});

test('summarizePreparedRoutes should report all when every route is prepared', t => {
  t.deepEqual(
    summarizePreparedRoutes([
      { prepared: { route: {} } as never },
      { prepared: { route: {} } as never },
    ]),
    {
      routeCount: 2,
      preparedCount: 2,
      preparedMode: 'all',
    }
  );
});
