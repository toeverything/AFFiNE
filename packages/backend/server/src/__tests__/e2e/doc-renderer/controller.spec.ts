import { app, createApp, e2e, Mockers } from '../test';

e2e('should render doc share page with apple-itunes-app meta tag', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  const docSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  // set public to true
  await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot.id,
    public: true,
  });

  const res = await app
    .GET(`/workspace/${workspace.id}/${docSnapshot.id}`)
    .expect(200)
    .expect('Content-Type', 'text/html; charset=utf-8');

  t.regex(
    res.text,
    /<meta name="apple-itunes-app" content="app-id=6736937980" \/>/
  );
});

e2e.serial(
  'should render doc share page without apple-itunes-app meta tag when selfhosted',
  async t => {
    const previousDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
    // @ts-expect-error override
    globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
    try {
      await using app = await createApp();

      const owner = await app.signup();
      const workspace = await app.create(Mockers.Workspace, {
        owner,
      });

      const docSnapshot = await app.create(Mockers.DocSnapshot, {
        workspaceId: workspace.id,
        user: owner,
      });
      // set public to true
      await app.create(Mockers.DocMeta, {
        workspaceId: workspace.id,
        docId: docSnapshot.id,
        public: true,
      });

      const res = await app
        .GET(`/workspace/${workspace.id}/${docSnapshot.id}`)
        .expect(200)
        .expect('Content-Type', 'text/html; charset=utf-8');

      t.notRegex(
        res.text,
        /<meta name="apple-itunes-app" content="app-id=6736937980" \/>/
      );
    } finally {
      // @ts-expect-error restore mutable test env singleton
      globalThis.env.DEPLOYMENT_TYPE = previousDeploymentType;
    }
  }
);
