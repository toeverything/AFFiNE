import type { IncomingMessage } from 'node:http';

import type { RawBodyRequest } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { raw } from 'express';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import {
  AFFiNELogger,
  buildCorsAllowedOrigins,
  CacheInterceptor,
  CloudThrottlerGuard,
  Config,
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  corsOriginCallback,
  GlobalExceptionFilter,
  URLHelper,
} from './base';
import { SocketIoAdapter } from './base/websocket';
import { AuthGuard } from './core/auth';
import { TelemetryService } from './core/telemetry/service';
import { ServerRole } from './env';
import { serverTimingAndCache } from './middleware/timing';

const OneMB = 1024 * 1024;

export function configureBodyParsers(
  app: NestExpressApplication,
  serverPath: string
) {
  let start = 0;
  let end = serverPath.length;
  while (start < end && serverPath[start] === '/') start++;
  while (end > start && serverPath[end - 1] === '/') end--;
  const serverPrefix = serverPath.slice(start, end);
  app.use(
    `${serverPrefix ? `/${serverPrefix}` : ''}/api/copilot/chat/:sessionId/attachments/:key`,
    raw({
      limit: 20 * OneMB,
      type: () => true,
      verify: (req: RawBodyRequest<IncomingMessage>, _res, buffer) => {
        req.rawBody = buffer;
      },
    })
  );
  app.useBodyParser('raw', { limit: 100 * OneMB });
}

export async function run() {
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    rawBody: true,
    bodyParser: true,
    bufferLogs: true,
  });

  const config = app.get(Config);
  configureBodyParsers(app, config.server.path);

  const logger = app.get(AFFiNELogger);
  app.useLogger(logger);
  const url = app.get(URLHelper);
  let telemetry: TelemetryService | null = null;
  try {
    if (env.role !== ServerRole.Worker) {
      telemetry = app.get(TelemetryService, { strict: false });
    }
  } catch {
    telemetry = null;
  }

  const defaultAllowedOrigins = buildCorsAllowedOrigins(url);

  app.enableCors((req, callback) => {
    const requestPath = req.path ?? req.url ?? '';
    const appendedOrigins = telemetry?.getAllowedOrigins(requestPath) ?? [];
    const finalAllowedOrigins = appendedOrigins.length
      ? new Set([...defaultAllowedOrigins, ...appendedOrigins])
      : defaultAllowedOrigins;

    callback(null, {
      origin: (origin, originCallback) => {
        corsOriginCallback(
          origin,
          finalAllowedOrigins,
          blockedOrigin => {
            if (!appendedOrigins.length) {
              logger.warn(
                `Blocked CORS request from origin: ${blockedOrigin}`,
                { requestPath }
              );
            }
          },
          originCallback
        );
      },
      credentials: true,
      methods: CORS_ALLOWED_METHODS,
      allowedHeaders: CORS_ALLOWED_HEADERS,
      exposedHeaders: CORS_EXPOSED_HEADERS,
      maxAge: 86400,
      optionsSuccessStatus: 204,
    });
  });

  if (config.server.path) {
    app.setGlobalPrefix(config.server.path);
  }

  app.use(serverTimingAndCache);

  app.use(
    graphqlUploadExpress({
      maxFileSize: 100 * OneMB,
      maxFiles: 32,
    })
  );

  if (env.role === ServerRole.Worker) {
    app.useGlobalGuards(app.get(CloudThrottlerGuard));
  } else {
    app.useGlobalGuards(app.get(AuthGuard), app.get(CloudThrottlerGuard));
  }
  app.useGlobalInterceptors(app.get(CacheInterceptor));
  app.useGlobalFilters(new GlobalExceptionFilter(app.getHttpAdapter()));
  app.use(cookieParser());
  // only enable shutdown hooks in production
  // https://docs.nestjs.com/fundamentals/lifecycle-events#application-shutdown
  if (env.prod) {
    app.enableShutdownHooks();
  }

  const adapter = new SocketIoAdapter(app);
  app.useWebSocketAdapter(adapter);

  if (env.dev) {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    // Swagger API Docs
    const docConfig = new DocumentBuilder()
      .setTitle('AFFiNE API')
      .setDescription(`AFFiNE Server ${env.version} API documentation`)
      .setVersion(`${env.version}`)
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('/api/docs', app, documentFactory, {
      useGlobalPrefix: true,
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(config.server.port, config.server.listenAddr);

  const formattedAddr = config.server.listenAddr.includes(':')
    ? `[${config.server.listenAddr}]`
    : config.server.listenAddr;

  logger.log(`AFFiNE Server is running in [${env.DEPLOYMENT_TYPE}] mode`);
  logger.log(`Listening on http://${formattedAddr}:${config.server.port}`);
  logger.log(`And the public server should be recognized as ${url.baseUrl}`);
}
