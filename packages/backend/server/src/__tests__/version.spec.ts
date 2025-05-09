import { Controller, Get } from '@nestjs/common';
import test from 'ava';
import Sinon from 'sinon';

import { AppModule } from '../app.module';
import { ConfigFactory, UseNamedGuard } from '../base';
import { Public } from '../core/auth/guard';
import { VersionService } from '../core/version/service';
import { createTestingApp, TestingApp } from './utils';

@Public()
@Controller('/guarded')
class GuardedController {
  @UseNamedGuard('version')
  @Get('/test')
  test() {
    return 'test';
  }
}

let app: TestingApp;
let config: ConfigFactory;
let version: VersionService;

function checkVersion(enabled = true) {
  config.override({
    client: {
      versionControl: {
        enabled,
        requiredVersion: '>=0.20.0',
      },
    },
  });
}

test.before(async () => {
  app = await createTestingApp({
    imports: [AppModule],
    controllers: [GuardedController],
  });

  version = app.get(VersionService, { strict: false });
  config = app.get(ConfigFactory, { strict: false });
});

test.beforeEach(async () => {
  Sinon.reset();

  checkVersion(true);
});

test.after.always(async () => {
  await app.close();
});

test('should passthrough if version check is not enabled', async t => {
  checkVersion(false);

  const spy = Sinon.spy(version, 'checkVersion');

  let res = await app.GET('/guarded/test');

  t.is(res.status, 200);

  res = await app.GET('/guarded/test').set('x-affine-version', '0.20.0');

  t.is(res.status, 200);

  res = await app.GET('/guarded/test').set('x-affine-version', 'invalid');

  t.is(res.status, 200);
  t.true(spy.notCalled);
  spy.restore();
});

test('should passthrough is version range is invalid', async t => {
  config.override({
    client: {
      versionControl: {
        requiredVersion: 'invalid',
      },
    },
  });

  let res = await app.GET('/guarded/test').set('x-affine-version', 'invalid');

  t.is(res.status, 200);
});

test('should pass if client version is allowed', async t => {
  let res = await app.GET('/guarded/test').set('x-affine-version', '0.20.0');

  t.is(res.status, 200);

  res = await app.GET('/guarded/test').set('x-affine-version', '0.21.0');

  t.is(res.status, 200);

  config.override({
    client: {
      versionControl: {
        requiredVersion: '>=0.19.0',
      },
    },
  });

  res = await app.GET('/guarded/test').set('x-affine-version', '0.19.0');

  t.is(res.status, 200);
});

test('should fail if client version is not set or invalid', async t => {
  let res = await app.GET('/guarded/test');

  t.is(res.status, 403);
  t.is(
    res.body.message,
    'Unsupported client with version [unset_or_invalid], required version is [>=0.20.0].'
  );

  res = await app.GET('/guarded/test').set('x-affine-version', 'invalid');

  t.is(res.status, 403);
  t.is(
    res.body.message,
    'Unsupported client with version [invalid], required version is [>=0.20.0].'
  );
});

test('should tell upgrade if client version is lower than allowed', async t => {
  config.override({
    client: {
      versionControl: {
        requiredVersion: '>=0.21.0 <=0.22.0',
      },
    },
  });

  let res = await app.GET('/guarded/test').set('x-affine-version', '0.20.0');

  t.is(res.status, 403);
  t.is(
    res.body.message,
    'Unsupported client with version [0.20.0], required version is [>=0.21.0 <=0.22.0].'
  );
});

test('should tell downgrade if client version is higher than allowed', async t => {
  config.override({
    client: {
      versionControl: {
        requiredVersion: '>=0.20.0 <=0.22.0',
      },
    },
  });

  let res = await app.GET('/guarded/test').set('x-affine-version', '0.23.0');

  t.is(res.status, 403);
  t.is(
    res.body.message,
    'Unsupported client with version [0.23.0], required version is [>=0.20.0 <=0.22.0].'
  );
});

test('should test prerelease version', async t => {
  config.override({
    client: {
      versionControl: {
        requiredVersion: '>=0.19.0',
      },
    },
  });

  let res = await app
    .GET('/guarded/test')
    .set('x-affine-version', '0.19.0-canary.1');

  // 0.19.0-canary.1 is lower than 0.19.0 obviously
  t.is(res.status, 403);

  res = await app
    .GET('/guarded/test')
    .set('x-affine-version', '0.20.0-canary.1');

  t.is(res.status, 200);

  res = await app.GET('/guarded/test').set('x-affine-version', '0.20.0-beta.2');

  t.is(res.status, 200);
});
