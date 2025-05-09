import { ModuleMetadata } from '@nestjs/common';
import {
  Test,
  TestingModule as NestjsTestingModule,
  TestingModuleBuilder,
} from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { FunctionalityModules } from '../app.module';
import { AFFiNELogger, EventBus, JobQueue } from '../base';
import { createFactory, MockEventBus, MockJobQueue } from './mocks';
import { TEST_LOG_LEVEL } from './utils';

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
  const { tapModule, ...meta } = metadata;

  const builder = Test.createTestingModule({
    ...meta,
    imports: [...FunctionalityModules, ...(meta.imports ?? [])],
  });

  builder
    .overrideProvider(JobQueue)
    .useValue(new MockJobQueue())
    .overrideProvider(EventBus)
    .useValue(new MockEventBus());

  // when custom override happens
  if (tapModule) {
    tapModule(builder);
  }

  const module = (await builder.compile()) as TestingModule;

  const logger = new AFFiNELogger();
  // we got a lot smoking tests try to break nestjs
  // can't tolerate the noisy logs
  logger.setLogLevels([TEST_LOG_LEVEL]);
  module.useLogger(logger);

  await module.init();
  module[Symbol.asyncDispose] = async () => {
    await module.close();
  };
  module.create = createFactory(module.get(PrismaClient));
  module.queue = module.get(JobQueue);
  module.event = module.get(EventBus);

  return module;
}
