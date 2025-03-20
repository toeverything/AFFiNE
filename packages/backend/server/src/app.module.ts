import {
  DynamicModule,
  ExecutionContext,
  ForwardReference,
  Logger,
  Module,
} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { get } from 'lodash-es';
import { ClsModule } from 'nestjs-cls';

import { AppController } from './app.controller';
import {
  getOptionalModuleMetadata,
  getRequestIdFromHost,
  getRequestIdFromRequest,
  ScannerModule,
} from './base';
import { CacheModule } from './base/cache';
import { AFFiNEConfig, ConfigModule, mergeConfigOverride } from './base/config';
import { ErrorModule } from './base/error';
import { EventModule } from './base/event';
import { GqlModule } from './base/graphql';
import { HelpersModule } from './base/helpers';
import { JobModule } from './base/job';
import { LoggerModule } from './base/logger';
import { MetricsModule } from './base/metrics';
import { MutexModule } from './base/mutex';
import { PrismaModule } from './base/prisma';
import { RedisModule } from './base/redis';
import { RuntimeModule } from './base/runtime';
import { StorageProviderModule } from './base/storage';
import { RateLimiterModule } from './base/throttler';
import { WebSocketModule } from './base/websocket';
import { AuthModule } from './core/auth';
import { ADD_ENABLED_FEATURES, ServerConfigModule } from './core/config';
import { DocStorageModule } from './core/doc';
import { DocRendererModule } from './core/doc-renderer';
import { DocServiceModule } from './core/doc-service';
import { FeatureModule } from './core/features';
import { MailModule } from './core/mail';
import { NotificationModule } from './core/notification';
import { PermissionModule } from './core/permission';
import { QuotaModule } from './core/quota';
import { SelfhostModule } from './core/selfhost';
import { StorageModule } from './core/storage';
import { SyncModule } from './core/sync';
import { UserModule } from './core/user';
import { VersionModule } from './core/version';
import { WorkspaceModule } from './core/workspaces';
import { ModelsModule } from './models';
import { REGISTERED_PLUGINS } from './plugins';
import { LicenseModule } from './plugins/license';
import { ENABLED_PLUGINS } from './plugins/registry';

export const FunctionalityModules = [
  ClsModule.forRoot({
    global: true,
    // for http / graphql request
    middleware: {
      mount: true,
      generateId: true,
      idGenerator(req: Request) {
        // make every request has a unique id to tracing
        return getRequestIdFromRequest(req, 'http');
      },
      setup(cls, _req, res: Response) {
        res.setHeader('X-Request-Id', cls.getId());
      },
    },
    // for websocket connection
    // https://papooch.github.io/nestjs-cls/considerations/compatibility#websockets
    interceptor: {
      mount: true,
      generateId: true,
      idGenerator(context: ExecutionContext) {
        // make every request has a unique id to tracing
        return getRequestIdFromHost(context);
      },
    },
    plugins: [
      // https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional/prisma-adapter
      new ClsPluginTransactional({
        adapter: new TransactionalAdapterPrisma({
          prismaInjectionToken: PrismaClient,
        }),
      }),
    ],
  }),
  ConfigModule.forRoot(),
  RuntimeModule,
  ScannerModule,
  EventModule,
  RedisModule,
  CacheModule,
  MutexModule,
  PrismaModule,
  MetricsModule,
  RateLimiterModule,
  StorageProviderModule,
  HelpersModule,
  ErrorModule,
  LoggerModule,
  WebSocketModule,
  JobModule.forRoot(),
];

function filterOptionalModule(
  config: AFFiNEConfig,
  module: AFFiNEModule | Promise<DynamicModule> | ForwardReference<any>
) {
  // can't deal with promise or forward reference
  if (module instanceof Promise || 'forwardRef' in module) {
    return module;
  }

  const requirements = getOptionalModuleMetadata(module, 'requires');
  // if condition not set or condition met, include the module
  if (requirements?.length) {
    const nonMetRequirements = requirements.filter(c => {
      const value = get(config, c);
      return (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0)
      );
    });

    if (nonMetRequirements.length) {
      const name = 'module' in module ? module.module.name : module.name;
      if (!config.node.test) {
        new Logger(name).warn(
          `${name} is not enabled because of the required configuration is not satisfied.`,
          'Unsatisfied configuration:',
          ...nonMetRequirements.map(config => `  AFFiNE.${config}`)
        );
      }
      return null;
    }
  }

  const predicator = getOptionalModuleMetadata(module, 'if');
  if (predicator && !predicator(config)) {
    return null;
  }

  const contribution = getOptionalModuleMetadata(module, 'contributesTo');
  if (contribution) {
    ADD_ENABLED_FEATURES(contribution);
  }

  const subModules = getOptionalModuleMetadata(module, 'imports');
  const filteredSubModules = subModules
    ?.map(subModule => filterOptionalModule(config, subModule))
    .filter(Boolean);
  Reflect.defineMetadata('imports', filteredSubModules, module);

  return module;
}

export class AppModuleBuilder {
  private readonly modules: AFFiNEModule[] = [];
  constructor(private readonly config: AFFiNEConfig) {}

  use(...modules: AFFiNEModule[]): this {
    modules.forEach(m => {
      const result = filterOptionalModule(this.config, m);
      if (result) {
        this.modules.push(m);
      }
    });

    return this;
  }

  useIf(
    predicator: (config: AFFiNEConfig) => boolean,
    ...modules: AFFiNEModule[]
  ): this {
    if (predicator(this.config)) {
      this.use(...modules);
    }

    return this;
  }

  compile() {
    @Module({
      imports: this.modules,
      controllers: [AppController],
    })
    class AppModule {}

    return AppModule;
  }
}

export function buildAppModule() {
  AFFiNE = mergeConfigOverride(AFFiNE);
  const factor = new AppModuleBuilder(AFFiNE);

  factor
    // basic
    .use(...FunctionalityModules)
    .use(ModelsModule)

    // enable schedule module on graphql server and doc service
    .useIf(
      config => config.flavor.graphql || config.flavor.doc,
      ScheduleModule.forRoot()
    )

    // auth
    .use(UserModule, AuthModule, PermissionModule)

    // business modules
    .use(
      FeatureModule,
      QuotaModule,
      DocStorageModule,
      NotificationModule,
      MailModule
    )

    // sync server only
    .useIf(config => config.flavor.sync, SyncModule)

    // graphql server only
    .useIf(
      config => config.flavor.graphql,
      VersionModule,
      GqlModule,
      StorageModule,
      ServerConfigModule,
      WorkspaceModule,
      LicenseModule
    )

    // doc service only
    .useIf(config => config.flavor.doc, DocServiceModule)

    // self hosted server only
    .useIf(config => config.isSelfhosted, SelfhostModule)
    .useIf(config => config.flavor.renderer, DocRendererModule);

  // plugin modules
  ENABLED_PLUGINS.forEach(name => {
    const plugin = REGISTERED_PLUGINS.get(name);
    if (!plugin) {
      new Logger('AppBuilder').warn(`Unknown plugin ${name}`);
      return;
    }

    factor.use(plugin);
  });

  return factor.compile();
}

export const AppModule = buildAppModule();
