import { ModuleMetadata } from '@nestjs/common';
import {
  Test,
  TestingModule as NestjsTestingModule,
  TestingModuleBuilder,
} from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { FunctionalityModules } from '../app.module';
import { AFFiNELogger, EventBus } from '../base';
import { OVERRIDE_CONFIG_TOKEN } from '../base/config/factory';
import { getDefaultConfig } from '../base/config/register';
import { BackendRuntimeProvider } from '../core/backend-runtime';
import { StorageRuntimeProvider } from '../core/storage-runtime';
import { ServerConfigHandle } from '../native';
import { createFactory, MockEventBus } from './mocks';
import { TEST_LOG_LEVEL } from './utils';
import {
  applyTestConfigOverrides,
  createTestRuntimeConfig,
} from './utils/runtime-config';

interface TestingModuleMetadata extends ModuleMetadata {
  tapModule?(m: TestingModuleBuilder): void;
}

export interface TestingModule extends NestjsTestingModule {
  [Symbol.asyncDispose](): Promise<void>;
  create: ReturnType<typeof createFactory>;
  event: MockEventBus;
}

export async function createModule(
  metadata: TestingModuleMetadata = {}
): Promise<TestingModule> {
  const config = getDefaultConfig();
  const runtimeConfig = await createTestRuntimeConfig(
    config.db.datasourceUrl,
    config.indexer
  );
  const { tapModule, ...meta } = metadata;
  const functionalityModules = [...FunctionalityModules];

  const builder = Test.createTestingModule({
    ...meta,
    imports: [...functionalityModules, ...(meta.imports ?? [])],
  });

  builder.overrideProvider(EventBus).useValue(new MockEventBus());
  builder.overrideProvider(ServerConfigHandle).useFactory({
    factory: (overrides?: DeepPartial<AppConfig>) => {
      applyTestConfigOverrides(runtimeConfig.configPath, overrides);
      return new ServerConfigHandle(runtimeConfig.configPath);
    },
    inject: [{ token: OVERRIDE_CONFIG_TOKEN, optional: true }],
  });

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
  module.event = module.get(EventBus);

  return module;
}
