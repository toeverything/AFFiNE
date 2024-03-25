import type { INestApplication } from '@nestjs/common';
import type { TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';

import { AppModule } from '../src/app.module';
import { FeatureManagementService } from '../src/core/features';
import { MailService } from '../src/fundamentals/mailer';
import { createTestingApp, createWorkspace, inviteUser, signUp } from './utils';
const test = ava as TestFn<{
  app: INestApplication;
  mail: MailService;
}>;

test.beforeEach(async t => {
  const { module, app } = await createTestingApp({
    imports: [AppModule],
    tapModule: module => {
      module.overrideProvider(FeatureManagementService).useValue({
        hasWorkspaceFeature() {
          return false;
        },
      });
    },
  });

  const mail = module.get(MailService);
  t.context.app = app;
  t.context.mail = mail;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should send invite email', async t => {
  const { mail, app } = t.context;

  if (mail.hasConfigured()) {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);

    const stub = Sinon.stub(mail, 'sendMail');

    await inviteUser(
      app,
      u1.token.token,
      workspace.id,
      u2.email,
      'Admin',
      true
    );

    t.true(stub.calledOnce);

    const args = stub.args[0][0];

    t.is(args.to, u2.email);
    t.true(
      args.subject!.startsWith(
        `${u1.name} invited you to join` /* we don't know the name of mocked workspace */
      )
    );
  }
  t.pass();
});
