import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import test from 'ava';

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

type RunSelfHostPredeploy = (options?: {
  prepareConfig?: () => void;
  exec?: (command: string, options?: unknown) => string;
}) => void;

test('self-host-predeploy runs all package.json predeploy steps in order', async t => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf-8')
  ) as { scripts: { predeploy: string } };
  const expectedPredeploySteps = pkg.scripts.predeploy
    .split('&&')
    .map(step => step.trim());

  const scriptUrl = pathToFileURL(
    path.join(serverRoot, 'scripts/self-host-predeploy.js')
  ).href;
  const { runSelfHostPredeploy } = (await import(scriptUrl)) as {
    runSelfHostPredeploy: RunSelfHostPredeploy;
  };

  const executed: string[] = [];
  let prepared = false;

  runSelfHostPredeploy({
    prepareConfig: () => {
      prepared = true;
    },
    exec: command => {
      executed.push(command);
      return '';
    },
  });

  t.true(prepared);
  t.is(
    executed[0],
    'yarn prisma migrate resolve --rolled-back 20250521083048_fix_workspace_embedding_chunk_primary_key'
  );
  t.deepEqual(executed.slice(1), expectedPredeploySteps);
});
