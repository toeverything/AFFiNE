import { ModuleMetadata } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Query, Resolver } from '@nestjs/graphql';
import {
  Test,
  TestingModule as BaseTestingModule,
  TestingModuleBuilder,
} from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { buildAppModule, FunctionalityModules } from '../../app.module';
import { AFFiNELogger, ConfigFactory, JobModule, JobQueue } from '../../base';
import { GqlModule } from '../../base/graphql';
import { ServerConfigModule } from '../../core';
import { AuthGuard, AuthModule } from '../../core/auth';
import { BACKEND_RUNTIME_CONFIG_PATHS } from '../../core/backend-runtime';
import { Mailer, MailModule } from '../../core/mail';
import { ModelsModule } from '../../models';
// for jsdoc inference
// oxlint-disable-next-line no-unused-vars
import type { createModule } from '../create-module';
import { createFactory, MockJobModule, MockJobQueue } from '../mocks';
import { MockMailer } from '../mocks/mailer.mock';
import { createTestRuntimeConfig } from './runtime-config';
import { initTestingDB, TEST_LOG_LEVEL } from './utils';

interface TestingModuleMetadata extends ModuleMetadata {
  tapModule?(m: TestingModuleBuilder): void;
}

export interface TestingModule extends BaseTestingModule {
  initTestingDB(): Promise<void>;
  create: ReturnType<typeof createFactory>;
  mails: MockMailer;
  queue: MockJobQueue;
  [Symbol.asyncDispose](): Promise<void>;
}

function dedupeModules(modules: NonNullable<ModuleMetadata['imports']>) {
  const map = new Map();

  modules.forEach(m => {
    if ('module' in m) {
      map.set(m.module, m);
    } else {
      map.set(m, m);
    }
  });

  return Array.from(map.values());
}

function testingFunctionalityModules() {
  return [
    ...FunctionalityModules.filter(module => {
      const moduleType = 'module' in module ? module.module : module;
      return moduleType !== JobModule;
    }),
    MockJobModule,
  ];
}

@Resolver(() => String)
class MockResolver {
  @Query(() => String)
  hello() {
    return 'hello world';
  }
}

/**
 * @deprecated use {@link createModule} instead
 */
export async function createTestingModule(
  moduleDef: TestingModuleMetadata = {},
  autoInitialize = true
): Promise<TestingModule> {
  const config = new ConfigFactory().config;
  const runtimeConfig = await createTestRuntimeConfig(
    config.db.datasourceUrl,
    config.indexer
  );
  // setting up
  let imports = moduleDef.imports ?? [buildAppModule(globalThis.env)];
  imports =
    // @ts-expect-error ignore the type error
    imports[0].module?.name === 'AppModule'
      ? imports
      : dedupeModules([
          ...testingFunctionalityModules(),
          ModelsModule,
          AuthModule,
          GqlModule,
          MailModule,
          ServerConfigModule,
          ...imports,
        ]);

  const builder = Test.createTestingModule({
    imports,
    providers: [
      {
        provide: APP_GUARD,
        useClass: AuthGuard,
      },
      MockResolver,
      ...(moduleDef.providers ?? []),
    ],
    controllers: moduleDef.controllers,
  });

  builder.overrideProvider(Mailer).useClass(MockMailer);
  builder.overrideProvider(JobQueue).useClass(MockJobQueue);
  builder
    .overrideProvider(BACKEND_RUNTIME_CONFIG_PATHS)
    .useValue([runtimeConfig.configPath]);
  if (moduleDef.tapModule) {
    moduleDef.tapModule(builder);
  }

  let module: BaseTestingModule;
  try {
    module = await builder.compile();
  } catch (error) {
    await runtimeConfig.cleanup();
    throw error;
  }
  module.get(ConfigFactory).override({
    storages: {
      avatar: {
        storage: {
          provider: 'assetpack',
          bucket: 'avatars',
          config: { path: runtimeConfig.storagePath },
        },
      },
      blob: {
        storage: {
          provider: 'assetpack',
          bucket: 'blobs',
          config: { path: runtimeConfig.storagePath },
        },
      },
    },
    copilot: {
      enabled: true,
      storage: {
        provider: 'assetpack',
        bucket: 'copilot',
        config: { path: runtimeConfig.storagePath },
      },
    },
  });

  const testingModule = module as TestingModule;

  testingModule.initTestingDB = async () => {
    await initTestingDB(module);
  };

  testingModule.create = createFactory(
    module.get(PrismaClient, { strict: false })
  );

  const close = testingModule.close.bind(testingModule);
  let closePromise: Promise<void> | undefined;
  testingModule.close = () => {
    return (closePromise ??= (async () => {
      try {
        await close();
      } finally {
        await runtimeConfig.cleanup();
      }
    })());
  };
  testingModule[Symbol.asyncDispose] = () => testingModule.close();

  testingModule.mails = module.get(Mailer, { strict: false }) as MockMailer;
  testingModule.queue = module.get(JobQueue, { strict: false }) as MockJobQueue;

  const logger = new AFFiNELogger();
  // we got a lot smoking tests try to break nestjs
  // can't tolerate the noisy logs
  logger.setLogLevels([TEST_LOG_LEVEL]);
  module.useLogger(logger);

  if (autoInitialize) {
    try {
      await testingModule.initTestingDB();
      await testingModule.init();
    } catch (error) {
      await testingModule.close();
      throw error;
    }
  }
  return testingModule;
}
