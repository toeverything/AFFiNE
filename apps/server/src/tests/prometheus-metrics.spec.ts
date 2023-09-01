import { ok } from 'node:assert';

import { Test, TestingModule } from '@nestjs/testing';
import test from 'ava';
import { register } from 'prom-client';

import { MetricsModule } from '../metrics';
import { Metrics } from '../metrics/metrics';
import { PrismaModule } from '../prisma';

let metrics: Metrics;
let module: TestingModule;

test.beforeEach(async () => {
  module = await Test.createTestingModule({
    imports: [MetricsModule, PrismaModule],
  }).compile();

  metrics = module.get(Metrics);
});

test.afterEach(async () => {
  await module.close();
});

test('should be able to increment counter', async t => {
  metrics.socketIOEventCounter(1, { event: 'client-handshake' });
  const socketIOCounterMetric =
    await register.getSingleMetric('socket_io_counter');
  ok(socketIOCounterMetric);

  ok(
    JSON.stringify((await socketIOCounterMetric.get()).values) ===
      '[{"value":1,"labels":{"event":"client-handshake"}}]'
  );
  t.pass();
});

test('should be able to timer', async t => {
  let minimum: number;
  {
    const endTimer = metrics.socketIOEventTimer({ event: 'client-handshake' });
    const a = performance.now();
    await new Promise(resolve => setTimeout(resolve, 50));
    const b = performance.now();
    minimum = b - a;
    endTimer();
  }

  let maximum: number;
  {
    const a = performance.now();
    const endTimer = metrics.socketIOEventTimer({ event: 'client-handshake' });
    await new Promise(resolve => setTimeout(resolve, 100));
    endTimer();
    const b = performance.now();
    maximum = b - a;
  }

  const socketIOTimerMetric = register.getSingleMetric('socket_io_timer');
  ok(socketIOTimerMetric);

  const observations = (await socketIOTimerMetric.get()).values;

  for (const observation of observations) {
    if (
      observation.labels.event === 'client-handshake' &&
      'quantile' in observation.labels
    ) {
      ok(
        observation.value >= minimum / 1000,
        'observation.value should be greater than minimum'
      );
      ok(
        observation.value <= maximum / 1000,
        'observation.value should be less than maximum'
      );
    }
  }
  t.pass();
});
