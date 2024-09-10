import {
  DynamicModule,
  ForwardReference,
  Logger,
  Module,
} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { get } from 'lodash-es';

import { AppController } from './app.controller';
import { AuthModule } from './core/auth';
import { ADD_ENABLED_FEATURES, ServerConfigModule } from './core/config';
import { DocStorageModule } from './core/doc';
import { DocRendererModule } from './core/doc-renderer';
import { FeatureModule } from './core/features';
import { PermissionModule } from './core/permission';
import { QuotaModule } from './core/quota';
import { SelfhostModule } from './core/selfhost';
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
    .useIf(config => config.flavor.sync, WebSocketModule)

    // auth
    .use(UserModule, AuthModule, PermissionModule)

    // business modules
    .use(FeatureModule, QuotaModule, DocStorageModule)

    // sync server only
    .useIf(config => config.flavor.sync, SyncModule)

    // graphql server only
    .useIf(
      config => config.flavor.graphql,
      ScheduleModule.forRoot(),
      GqlModule,
      StorageModule,
      ServerConfigModule,
      WorkspaceModule
    )

    // self hosted server only
    .useIf(config => config.isSelfhosted, SelfhostModule)
    .useIf(config => config.flavor.renderer, DocRendererModule);

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
