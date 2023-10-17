import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import test from 'ava';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../src/app';
import { ExceptionLogger } from '../src/middleware/exception-logger';
import { PrismaService } from '../src/prisma';

const gql = '/graphql';
const rest = '/rest';

let app: INestApplication;

class FakePrisma {
  get workspace() {
    return {
      async findUnique() {
        throw Error('exception from graphql');
      },
    };
  }
}

@Controller('rest')
export class MockController {
  @Get()
  test(): string {
    throw new Error('exception from rest api');
  }
}

test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [MockController],
  })
    .overrideProvider(PrismaService)
    .useClass(FakePrisma)
    .compile();
  app = module.createNestApplication({
    cors: true,
    bodyParser: true,
  });
  app.useGlobalFilters(new ExceptionLogger());
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();
});

test.afterEach.always(async () => {
  await app.close();
});

test('should get response from graphql', async t => {
  const id = 'workspace';

  const response = await request(app.getHttpServer())
    .post(gql)
    .send({
      name: 'getPublicWorkspace',
      query: `
          query getPublicWorkspace($id: String!) {
            publicWorkspace(id: $id) {
              id
            }
          }
        `,
      variables: { id },
    });

  t.is(response.status, 200);
  t.is(response.body.errors[0].message, 'exception from graphql');
});

test('should get response from rest api', async t => {
  const response = await request(app.getHttpServer()).get(rest);

  t.is(response.status, 500);
  t.is(response.body.error, 'exception from rest api');
});
