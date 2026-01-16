import { DynamicModule, ExecutionContext } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { ClsModule } from 'nestjs-cls';

import { AppController } from './app.controller';
import {
  getRequestFromHost,
  getRequestIdFromHost,
  getRequestIdFromRequest,
  ScannerModule,
} from './base';
import { CacheModule } from './base/cache';
import { ConfigModule } from './base/config';
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
import { StorageProviderModule } from './base/storage';
import { RateLimiterModule } from './base/throttler';
import { WebSocketModule } from './base/websocket';
import { AccessTokenModule } from './core/access-token';
import { AuthModule } from './core/auth';
import { CommentModule } from './core/comment';
import { ServerConfigModule, ServerConfigResolverModule } from './core/config';
import { DocStorageModule } from './core/doc';
import { DocRendererModule } from './core/doc-renderer';
import { DocServiceModule } from './core/doc-service';
import { FeatureModule } from './core/features';
import { MailModule } from './core/mail';
import { MonitorModule } from './core/monitor';
import { NotificationModule } from './core/notification';
import { PermissionModule } from './core/permission';
import { QueueDashboardModule } from './core/queue-dashboard';
import { QuotaModule } from './core/quota';
import { SelfhostModule } from './core/selfhost';
import { StorageModule } from './core/storage';
import { SyncModule } from './core/sync';
import { TelemetryModule } from './core/telemetry';
import { UserModule } from './core/user';
import { VersionModule } from './core/version';
import { WorkspaceModule } from './core/workspaces';
import { Env } from './env';
import { ModelsModule } from './models';
import { CalendarModule } from './plugins/calendar';
import { CaptchaModule } from './plugins/captcha';
import { CopilotModule } from './plugins/copilot';
import { CustomerIoModule } from './plugins/customerio';
import { GCloudModule } from './plugins/gcloud';
import { IndexerModule } from './plugins/indexer';
import { LicenseModule } from './plugins/license';
import { OAuthModule } from './plugins/oauth';
import { PaymentModule } from './plugins/payment';
import { WorkerModule } from './plugins/worker';

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
      setup(cls, req: Request, res: Response) {
        res.setHeader('X-Request-Id', cls.getId());
        cls.set(CLS_REQUEST_HOST, req.hostname);
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
      setup(cls, context: ExecutionContext) {
        const req = getRequestFromHost(context);
        cls.set(CLS_REQUEST_HOST, req.hostname);
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
  LoggerModule,
  ScannerModule,
  PrismaModule,
  EventModule,
  ConfigModule,
  RedisModule,
  CacheModule,
  MutexModule,
  MetricsModule,
  RateLimiterModule,
  StorageProviderModule,
  HelpersModule,
  ErrorModule,
  WebSocketModule,
  JobModule.forRoot(),
  ModelsModule,
  ScheduleModule.forRoot(),
  MonitorModule,
];

export class AppModuleBuilder {
  private readonly modules: AFFiNEModule[] = [];

  use(...modules: AFFiNEModule[]): this {
    modules.forEach(m => {
      this.modules.push(m);
    });

    return this;
  }

  useIf(predicator: () => boolean, ...modules: AFFiNEModule[]): this {
    if (predicator()) {
      this.use(...modules);
    }

    return this;
  }

  compile(): DynamicModule {
    class AppModule {}

    return {
      module: AppModule,
      imports: this.modules,
      controllers: [AppController],
    };
  }
}

export function buildAppModule(env: Env) {
  const factor = new AppModuleBuilder();

  factor
    // basic
    .use(...FunctionalityModules)

    // enable indexer module on graphql server and doc service
    .useIf(() => env.flavors.graphql || env.flavors.doc, IndexerModule)

    // auth
    .use(UserModule, AuthModule, PermissionModule)

    // business modules
    .use(
      ServerConfigModule,
      FeatureModule,
      QuotaModule,
      DocStorageModule,
      NotificationModule,
      MailModule
    )
    // renderer server only
    .useIf(() => env.flavors.renderer, DocRendererModule)
    // sync server only
    .useIf(() => env.flavors.sync, SyncModule, TelemetryModule)
    // graphql server only
    .useIf(
      () => env.flavors.graphql,
      GqlModule,
      VersionModule,
      StorageModule,
      ServerConfigResolverModule,
      WorkspaceModule,
      LicenseModule,
      PaymentModule,
      CopilotModule,
      CaptchaModule,
      OAuthModule,
      CalendarModule,
      CustomerIoModule,
      TelemetryModule,
      CommentModule,
      AccessTokenModule,
      QueueDashboardModule
    )
    // doc service only
    .useIf(() => env.flavors.doc, DocServiceModule)
    // self hosted server only
    .useIf(() => env.dev || env.selfhosted, WorkerModule, SelfhostModule)

    // gcloud
    .useIf(() => env.gcp, GCloudModule);

  return factor.compile();
}

export const AppModule = buildAppModule(env);
