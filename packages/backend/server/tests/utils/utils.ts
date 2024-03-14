import { INestApplication, ModuleMetadata } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Query, Resolver } from '@nestjs/graphql';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule, FunctionalityModules } from '../../src/app.module';
import { AuthGuard, AuthModule } from '../../src/core/auth';
import { UserFeaturesInit1698652531198 } from '../../src/data/migrations/1698652531198-user-features-init';
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
  moduleDef: TestingModuleMeatdata = {}
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
    await flushDB(prisma);
    await initFeatureConfigs(prisma);
  }

  return m;
}

export async function createTestingApp(moduleDef: TestingModuleMeatdata = {}) {
  const m = await createTestingModule(moduleDef);

  const app = m.createNestApplication({
    cors: true,
    bodyParser: true,
    rawBody: true,
  });

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

  return {
    module: m,
    app,
  };
}
