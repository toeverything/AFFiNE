import ava from 'ava';

import { Config } from '../../../base';
import { URLHelper } from '../../../base/helpers';
import { WorkerService } from '../service';
import { isOriginAllowed } from '../utils';

const test = ava;

test('allows global mobile origins and normalized configured origins only', t => {
  const config = Object.assign(new Config(), {
    server: {
      externalUrl: '',
      host: 'app.affine.local',
      hosts: [],
      port: 3010,
      https: true,
      path: '',
    },
    worker: {
      allowedOrigin: ['http://preview.affine.local/path'],
    },
  });
  const url = new URLHelper(config);
  const service = new WorkerService(config, url);

  service.onConfigInit();

  t.true(isOriginAllowed('capacitor://localhost', service.allowedOrigins));
  t.true(isOriginAllowed('https://localhost', service.allowedOrigins));
  t.true(
    isOriginAllowed('http://preview.affine.local', service.allowedOrigins)
  );
  t.false(isOriginAllowed('https://unrelated.example', service.allowedOrigins));
});
