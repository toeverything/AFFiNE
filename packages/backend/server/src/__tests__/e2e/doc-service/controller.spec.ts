import { randomUUID } from 'node:crypto';

import { CryptoHelper } from '../../../base';
import { app, e2e, Mockers } from '../test';

const crypto = app.get(CryptoHelper);

e2e('should get doc markdown success', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  const docSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });

  const path = `/rpc/workspaces/${workspace.id}/docs/${docSnapshot.id}/markdown`;
  const res = await app
    .GET(path)
    .set(
      'x-access-token',
      crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect(200)
    .expect('Content-Type', 'application/json; charset=utf-8');

  t.snapshot(res.body);
});

e2e('should get doc markdown return null when doc not exists', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  const docId = randomUUID();
  const path = `/rpc/workspaces/${workspace.id}/docs/${docId}/markdown`;
  const res = await app
    .GET(path)
    .set(
      'x-access-token',
      crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect(404)
    .expect('Content-Type', 'application/json; charset=utf-8');

  t.snapshot(res.body);
});
