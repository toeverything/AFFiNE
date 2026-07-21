import test from 'ava';
import Sinon from 'sinon';

import type { safeFetch } from '../../base';
import {
  PROVIDER_PROBE_MAX_BYTES,
  runProviderProbe,
} from '../../plugins/copilot/byok/probe';
import { ByokProvider } from '../../plugins/copilot/byok/types';

test('provider probe allows model responses and explicitly configured private targets', async t => {
  const fetch = Sinon.stub<
    Parameters<typeof safeFetch>,
    ReturnType<typeof safeFetch>
  >().resolves(new Response('{}', { status: 200 }));

  await runProviderProbe(
    fetch,
    ByokProvider.openai,
    'secret',
    'http://provider.internal/v1',
    true
  );

  t.is(fetch.firstCall.args[0], 'http://provider.internal/v1/models');
  t.deepEqual(fetch.firstCall.args[2], {
    timeoutMs: 10_000,
    maxRedirects: 3,
    maxBytes: PROVIDER_PROBE_MAX_BYTES,
    allowedHeaders: ['Authorization'],
    allowHttp: true,
    allowPrivateTargetOrigin: true,
  });
  t.true(PROVIDER_PROBE_MAX_BYTES >= 64 * 1024);
});

test('provider probe keeps private targets blocked by default', async t => {
  const fetch = Sinon.stub<
    Parameters<typeof safeFetch>,
    ReturnType<typeof safeFetch>
  >().resolves(new Response('{}', { status: 200 }));

  await runProviderProbe(
    fetch,
    ByokProvider.gemini,
    'secret',
    'https://provider.example/v1beta',
    false
  );

  t.false(fetch.firstCall.args[2]?.allowHttp);
  t.false(fetch.firstCall.args[2]?.allowPrivateTargetOrigin);
});
