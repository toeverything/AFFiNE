import { join } from 'node:path';

import { Logger, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { get } from 'lodash-es';

import { AppController } from './app.controller';
import { AuthGuard, AuthModule } from './core/auth';
import { ADD_ENABLED_FEATURES, ServerConfigModule } from './core/config';
import { DocModule } from './core/doc';
import { FeatureModule } from './core/features';
import { QuotaModule } from './core/quota';
import { StorageModule } from './core/storage';
import { SyncModule } from './core/sync';
import { UserModule } from './core/user';
import { WorkspaceModule } from './core/workspaces';
import { getOptionalModuleMetadata } from './fundamentals';
import { CacheInterceptor, CacheModule } from './fundamentals/cache';
import {
  type AvailablePlugins,
  Config,
  ConfigModule,
} from './fundamentals/config';
import { EventModule } from './fundamentals/event';
import { GqlModule } from './fundamentals/graphql';
import { HelpersModule } from './fundamentals/helpers';
import { MailModule } from './fundamentals/mailer';
import { MetricsModule } from './fundamentals/metrics';
import { PrismaModule } from './fundamentals/prisma';
import { StorageProviderModule } from './fundamentals/storage';
import { RateLimiterModule } from './fundamentals/throttler';
import { WebSocketModule } from './fundamentals/websocket';
import { REGISTERED_PLUGINS } from './plugins';

export const FunctionalityModules = [
  ConfigModule.forRoot(),
  ScheduleModule.forRoot(),
  EventModule,
  CacheModule,
  PrismaModule,
  MetricsModule,
  RateLimiterModule,
  MailModule,
  StorageProviderModule,
  HelpersModule,
];

export class AppModuleBuilder {
  private readonly modules: AFFiNEModule[] = [];
  constructor(private readonly config: Config) {}

  use(...modules: AFFiNEModule[]): this {
    modules.forEach(m => {
      const requirements = getOptionalModuleMetadata(m, 'requires');
      // if condition not set or condition met, include the module
      if (requirements?.length) {
        const nonMetRequirements = requirements.filter(c => {
          const value = get(this.config, c);
          return (
            value === undefined ||
            value === null ||
            (typeof value === 'string' && value.trim().length === 0)
          );
        });

        if (nonMetRequirements.length) {
          const name = 'module' in m ? m.module.name : m.name;
          new Logger(name).warn(
            `${name} is not enabled because of the required configuration is not satisfied.`,
            'Unsatisfied configuration:',
            ...nonMetRequirements.map(config => `  AFFiNE.${config}`)
          );
          return;
        }
      }

      const predicator = getOptionalModuleMetadata(m, 'if');
      if (predicator && !predicator(this.config)) {
        return;
      }

      const contribution = getOptionalModuleMetadata(m, 'contributesTo');
      if (contribution) {
        ADD_ENABLED_FEATURES(contribution);
      }
      this.modules.push(m);
    });

    return this;
  }

  useIf(
    predicator: (config: Config) => boolean,
    ...modules: AFFiNEModule[]
  ): this {
    if (predicator(this.config)) {
      this.use(...modules);
    }

    return this;
  }

  compile() {
    @Module({
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useClass: CacheInterceptor,
        },
        {
          provide: APP_GUARD,
          useClass: AuthGuard,
        },
      ],
      imports: this.modules,
      controllers: this.config.isSelfhosted ? [] : [AppController],
    })
    class AppModule {}

    return AppModule;
  }
}

function buildAppModule() {
  const factor = new AppModuleBuilder(AFFiNE);

  factor
    // common fundamental modules
    .use(...FunctionalityModules)
    // auth
    .use(AuthModule)

    // business modules
    .use(DocModule)

    // sync server only
    .useIf(config => config.flavor.sync, SyncModule)

    // graphql server only
    .useIf(
      config => config.flavor.graphql,
      ServerConfigModule,
      WebSocketModule,
      GqlModule,
      StorageModule,
      UserModule,
      WorkspaceModule,
      FeatureModule,
      QuotaModule
    )

    // self hosted server only
    .useIf(
      config => config.isSelfhosted,
      ServeStaticModule.forRoot({
        rootPath: join('/app', 'static'),
      })
    );

  // plugin modules
  AFFiNE.plugins.enabled.forEach(name => {
    const plugin = REGISTERED_PLUGINS.get(name as AvailablePlugins);
    if (!plugin) {
      throw new Error(`Unknown plugin ${name}`);
    }

    factor.use(plugin);
  });

  return factor.compile();
}

export const AppModule = buildAppModule();
