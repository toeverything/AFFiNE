import { INestApplication, ModuleMetadata } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Query, Resolver } from '@nestjs/graphql';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import type { Response } from 'supertest';
import supertest from 'supertest';

import { AppModule, FunctionalityModules } from '../../src/app.module';
import { AuthGuard, AuthModule } from '../../src/core/auth';
import { UserFeaturesInit1698652531198 } from '../../src/data/migrations/1698652531198-user-features-init';
import { Config, GlobalExceptionFilter } from '../../src/fundamentals';
import { GqlModule } from '../../src/fundamentals/graphql';

async function flushDB(client: PrismaClient) {
  const result: { tablename: string }[] =
    await client.$queryRaw`SELECT tablename
                           FROM pg_catalog.pg_tables
                           WHERE schemaname != 'pg_catalog'
                             AND schemaname != 'information_schema'`;

  // remove all table data
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${result
      .map(({ tablename }) => tablename)
      .filter(name => !name.includes('migrations'))
      .join(', ')}`
  );
}

async function initFeatureConfigs(db: PrismaClient) {
  await UserFeaturesInit1698652531198.up(db);
}

export async function initTestingDB(db: PrismaClient) {
  await flushDB(db);
  await initFeatureConfigs(db);
}

interface TestingModuleMeatdata extends ModuleMetadata {
  tapModule?(m: TestingModuleBuilder): void;
  tapApp?(app: INestApplication): void;
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

@Resolver(() => String)
class MockResolver {
  @Query(() => String)
  hello() {
    return 'hello world';
  }
}

export async function createTestingModule(
  moduleDef: TestingModuleMeatdata = {},
  init = true
) {
  // setting up
  let imports = moduleDef.imports ?? [];
  imports =
    imports[0] === AppModule
      ? [AppModule]
      : dedupeModules([
          ...FunctionalityModules,
          AuthModule,
          GqlModule,
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

  if (moduleDef.tapModule) {
    moduleDef.tapModule(builder);
  }

  const m = await builder.compile();

  const prisma = m.get(PrismaClient);
  if (prisma instanceof PrismaClient) {
    await initTestingDB(prisma);
  }

  if (init) {
    await m.init();

    const config = m.get(Config);
    // by pass password min length validation
    await config.runtime.set('auth/password.min', 1);
  }

  return m;
}

export async function createTestingApp(moduleDef: TestingModuleMeatdata = {}) {
  const m = await createTestingModule(moduleDef, false);

  const app = m.createNestApplication({
    cors: true,
    bodyParser: true,
    rawBody: true,
    logger: ['warn'],
  });

  app.useGlobalFilters(new GlobalExceptionFilter(app.getHttpAdapter()));
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );

  app.use(cookieParser());

  if (moduleDef.tapApp) {
    moduleDef.tapApp(app);
  }

  await app.init();

  const config = app.get(Config);
  // by pass password min length validation
  await config.runtime.set('auth/password.min', 1);

  return {
    module: m,
    app,
  };
}

export function handleGraphQLError(resp: Response) {
  const { errors } = resp.body;
  if (errors) {
    const cause = errors[0];
    const stacktrace = cause.extensions?.stacktrace;
    throw new Error(
      stacktrace
        ? Array.isArray(stacktrace)
          ? stacktrace.join('\n')
          : String(stacktrace)
        : cause.message,
      cause
    );
  }
}

export function gql(app: INestApplication, query?: string) {
  const req = supertest(app.getHttpServer())
    .post('/graphql')
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' });

  if (query) {
    return req.send({ query });
  }

  return req;
}

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
