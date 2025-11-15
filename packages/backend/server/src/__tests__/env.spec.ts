import test from 'ava';

import { Env } from '../env';

const envs = { ...process.env };
test.beforeEach(() => {
  process.env = { ...envs };
});

test('should init env', t => {
  t.true(globalThis.env.testing);
});

test('should read NODE_ENV', t => {
  process.env.NODE_ENV = 'test';
  t.deepEqual(
    ['test', 'development', 'production'].map(envVal => {
      process.env.NODE_ENV = envVal;
      const env = new Env();
      return env.NODE_ENV;
    }),
    ['test', 'development', 'production']
  );

  t.throws(
    () => {
      process.env.NODE_ENV = 'unknown';
      new Env();
    },
    {
      message:
        'Invalid NODE_ENV environment. `unknown` is not a valid NODE_ENV value.',
    }
  );
});

test('should read NAMESPACE', t => {
  t.deepEqual(
    ['dev', 'beta', 'production'].map(envVal => {
      process.env.AFFINE_ENV = envVal;
      const env = new Env();
      return env.NAMESPACE;
    }),
    ['dev', 'beta', 'production']
  );

  t.throws(() => {
    process.env.AFFINE_ENV = 'unknown';
    new Env();
  });
});

test('should read DEPLOYMENT_TYPE', t => {
  t.deepEqual(
    ['affine', 'selfhosted'].map(envVal => {
      process.env.DEPLOYMENT_TYPE = envVal;
      const env = new Env();
      return env.DEPLOYMENT_TYPE;
    }),
    ['affine', 'selfhosted']
  );

  t.throws(() => {
    process.env.DEPLOYMENT_TYPE = 'unknown';
    new Env();
  });
});

test('should read FLAVOR', t => {
  t.deepEqual(
    ['allinone', 'graphql', 'sync', 'renderer', 'doc', 'script'].map(envVal => {
      process.env.SERVER_FLAVOR = envVal;
      const env = new Env();
      return env.FLAVOR;
    }),
    ['allinone', 'graphql', 'sync', 'renderer', 'doc', 'script']
  );

  t.throws(
    () => {
      process.env.SERVER_FLAVOR = 'unknown';
      new Env();
    },
    {
      message:
        'Invalid value "unknown" for environment variable SERVER_FLAVOR, expected one of ["allinone","graphql","sync","renderer","doc","script"]',
    }
  );
});

test('should read platform', t => {
  t.deepEqual(
    ['gcp', 'unknown'].map(envVal => {
      process.env.DEPLOYMENT_PLATFORM = envVal;
      const env = new Env();
      return env.platform;
    }),
    ['gcp', 'unknown']
  );

  t.notThrows(() => {
    process.env.PLATFORM = 'unknown';
    new Env();
  });
});

test('should tell flavors correctly', t => {
  process.env.SERVER_FLAVOR = 'allinone';
  t.deepEqual(new Env().flavors, {
    graphql: true,
    sync: true,
    renderer: true,
    doc: true,
    script: false,
  });

  process.env.SERVER_FLAVOR = 'graphql';
  t.deepEqual(new Env().flavors, {
    graphql: true,
    sync: false,
    renderer: false,
    doc: false,
    script: false,
  });

  process.env.SERVER_FLAVOR = 'script';
  t.deepEqual(new Env().flavors, {
    graphql: false,
    sync: false,
    renderer: false,
    doc: false,
    script: true,
  });
});

test('should tell selfhosted correctly', t => {
  process.env.DEPLOYMENT_TYPE = 'selfhosted';
  t.true(new Env().selfhosted);

  process.env.DEPLOYMENT_TYPE = 'affine';
  t.false(new Env().selfhosted);
});

test('should tell namespaces correctly', t => {
  process.env.AFFINE_ENV = 'dev';
  t.deepEqual(new Env().namespaces, {
    canary: true,
    beta: false,
    production: false,
  });

  process.env.AFFINE_ENV = 'beta';
  t.deepEqual(new Env().namespaces, {
    canary: false,
    beta: true,
    production: false,
  });

  process.env.AFFINE_ENV = 'production';
  t.deepEqual(new Env().namespaces, {
    canary: false,
    beta: false,
    production: true,
  });
});
