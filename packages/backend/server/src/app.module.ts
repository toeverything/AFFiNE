import { join } from 'node:path';

import {
  DynamicModule,
  ForwardReference,
  Logger,
  Module,
} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { get } from 'lodash-es';

import { AppController } from './app.controller';
import { AuthModule } from './core/auth';
import { ADD_ENABLED_FEATURES, ServerConfigModule } from './core/config';
import { DocModule } from './core/doc';
import { FeatureModule } from './core/features';
import { QuotaModule } from './core/quota';
import { CustomSetupModule } from './core/setup';
import { StorageModule } from './core/storage';
import { SyncModule } from './core/sync';
import { UserModule } from './core/user';
import { WorkspaceModule } from './core/workspaces';
import { getOptionalModuleMetadata } from './fundamentals';
import { CacheModule } from './fundamentals/cache';
import {
  AFFiNEConfig,
  ConfigModule,
  mergeConfigOverride,
} from './fundamentals/config';
import { ErrorModule } from './fundamentals/error';
import { EventModule } from './fundamentals/event';
import { GqlModule } from './fundamentals/graphql';
import { HelpersModule } from './fundamentals/helpers';
import { MailModule } from './fundamentals/mailer';
import { MetricsModule } from './fundamentals/metrics';
import { MutexModule } from './fundamentals/mutex';
import { PrismaModule } from './fundamentals/prisma';
import { StorageProviderModule } from './fundamentals/storage';
import { RateLimiterModule } from './fundamentals/throttler';
import { WebSocketModule } from './fundamentals/websocket';
import { REGISTERED_PLUGINS } from './plugins';
import { ENABLED_PLUGINS } from './plugins/registry';

export const FunctionalityModules = [
  ConfigModule.forRoot(),
  ScheduleModule.forRoot(),
  EventModule,
  CacheModule,
  MutexModule,
  PrismaModule,
  MetricsModule,
  RateLimiterModule,
  MailModule,
  StorageProviderModule,
  HelpersModule,
  ErrorModule,
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
      new Logger(name).warn(
        `${name} is not enabled because of the required configuration is not satisfied.`,
        'Unsatisfied configuration:',
        ...nonMetRequirements.map(config => `  AFFiNE.${config}`)
      );
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
      controllers: this.config.isSelfhosted ? [] : [AppController],
    })
    class AppModule {}

    return AppModule;
  }
}

function buildAppModule() {
  AFFiNE = mergeConfigOverride(AFFiNE);
  const factor = new AppModuleBuilder(AFFiNE);

  factor
    // common fundamental modules
    .use(...FunctionalityModules)
    .useIf(config => config.flavor.sync, WebSocketModule)

    // auth
    .use(UserModule, AuthModule)

    // business modules
    .use(DocModule)

    // sync server only
    .useIf(config => config.flavor.sync, SyncModule)

    // graphql server only
    .useIf(
      config => config.flavor.graphql,
      ServerConfigModule,
      GqlModule,
      StorageModule,
      WorkspaceModule,
      FeatureModule,
      QuotaModule
    )

    // self hosted server only
    .useIf(
      config => config.isSelfhosted,
      CustomSetupModule,
      ServeStaticModule.forRoot({
        rootPath: join('/app', 'static'),
        exclude: ['/admin*'],
      }),
      ServeStaticModule.forRoot({
        rootPath: join('/app', 'static', 'admin'),
        serveRoot: '/admin',
      })
    );

  // plugin modules
  ENABLED_PLUGINS.forEach(name => {
    const plugin = REGISTERED_PLUGINS.get(name);
    if (!plugin) {
      throw new Error(`Unknown plugin ${name}`);
    }

    factor.use(plugin);
  });

  return factor.compile();
}

export const AppModule = buildAppModule();
