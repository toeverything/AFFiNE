import ava from 'ava';

import { URLHelper } from '../../../base/helpers';
import { WorkerService } from '../service';
import { isOriginAllowed } from '../utils';

const test = ava;

test('allows global mobile origins and normalized configured origins only', t => {
  const url = new URLHelper({
    server: {
      externalUrl: '',
      host: 'app.affine.local',
      hosts: [],
      port: 3010,
      https: true,
      path: '',
    },
  } as any);
  const service = new WorkerService(
    {
      worker: {
        allowedOrigin: ['http://preview.affine.local/path'],
      },
    } as any,
    url
  );

  service.onConfigInit();

  t.true(isOriginAllowed('capacitor://localhost', service.allowedOrigins));
  t.true(isOriginAllowed('https://localhost', service.allowedOrigins));
  t.true(
    isOriginAllowed('http://preview.affine.local', service.allowedOrigins)
  );
  t.false(isOriginAllowed('https://unrelated.example', service.allowedOrigins));
});
