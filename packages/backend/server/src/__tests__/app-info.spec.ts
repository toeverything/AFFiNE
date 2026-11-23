import test from 'ava';

import { AppController } from '../app.controller';
import { DeploymentType } from '../env';
import type { ServerConfigHandle } from '../native';

test('public info preserves its response contract without internal Redis or baseline fields', t => {
  const controller = new AppController({
    deploymentType: 'selfhosted',
  } as ServerConfigHandle);
  t.deepEqual(controller.info(), {
    compatibility: env.version,
    message: `AFFiNE ${env.version} Server`,
    type: DeploymentType.Selfhosted,
    flavor: env.FLAVOR,
  });
});
