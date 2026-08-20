import { ModuleMetadata } from '@nestjs/common';
import {
  Test,
  TestingModule as NestjsTestingModule,
  TestingModuleBuilder,
} from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { FunctionalityModules } from '../app.module';
import {
  AFFiNELogger,
  ConfigFactory,
  EventBus,
  JobModule,
  JobQueue,
} from '../base';
import {
  BACKEND_RUNTIME_CONFIG_PATHS,
  BackendRuntimeProvider,
} from '../core/backend-runtime';
import { StorageRuntimeProvider } from '../core/storage-runtime';
import {
  createFactory,
  MockEventBus,
  MockJobModule,
  MockJobQueue,
} from './mocks';
import { TEST_LOG_LEVEL } from './utils';
import { createTestRuntimeConfig } from './utils/runtime-config';

interface TestingModuleMetadata extends ModuleMetadata {
  tapModule?(m: TestingModuleBuilder): void;
}

export interface TestingModule extends NestjsTestingModule {
  [Symbol.asyncDispose](): Promise<void>;
  create: ReturnType<typeof createFactory>;
  queue: MockJobQueue;
  event: MockEventBus;
}

export async function createModule(
  metadata: TestingModuleMetadata = {}
): Promise<TestingModule> {
  const config = new ConfigFactory().config;
  const runtimeConfig = await createTestRuntimeConfig(
    config.db.datasourceUrl,
    config.indexer
  );
  const { tapModule, ...meta } = metadata;
  const functionalityModules = [
    ...FunctionalityModules.filter(module => {
      const moduleType = 'module' in module ? module.module : module;
      return moduleType !== JobModule;
    }),
    MockJobModule,
  ];

  const builder = Test.createTestingModule({
    ...meta,
    imports: [...functionalityModules, ...(meta.imports ?? [])],
  });

  builder
    .overrideProvider(JobQueue)
    .useValue(new MockJobQueue())
    .overrideProvider(EventBus)
    .useValue(new MockEventBus())
    .overrideProvider(BACKEND_RUNTIME_CONFIG_PATHS)
    .useValue([runtimeConfig.configPath]);

  // when custom override happens
  if (tapModule) {
    tapModule(builder);
  }

  let module: TestingModule;
  try {
    module = (await builder.compile()) as TestingModule;
  } catch (error) {
    await runtimeConfig.cleanup();
    throw error;
  }

  const logger = new AFFiNELogger();
  // we got a lot smoking tests try to break nestjs
  // can't tolerate the noisy logs
  logger.setLogLevels([TEST_LOG_LEVEL]);
  module.useLogger(logger);

  const close = module.close.bind(module);
  let closePromise: Promise<void> | undefined;
  module.close = () => {
    return (closePromise ??= (async () => {
      try {
        await close();
      } finally {
        await runtimeConfig.cleanup();
      }
    })());
  };

  try {
    await module.init();
  } catch (error) {
    await module.close();
    throw error;
  }
  const backendRuntime = module.get(BackendRuntimeProvider);
  if (backendRuntime instanceof BackendRuntimeProvider) {
    await backendRuntime.runMigrations();
    await backendRuntime.onConfigChanged({ updates: { indexer: {} } });
  }
  const storageRuntime = module.get(StorageRuntimeProvider);
  if (storageRuntime instanceof StorageRuntimeProvider) {
    await storageRuntime.runMigrations();
  }
  module[Symbol.asyncDispose] = async () => {
    await module.close();
  };
  module.create = createFactory(module.get(PrismaClient));
  module.queue = module.get(JobQueue);
  module.event = module.get(EventBus);

  return module;
}
