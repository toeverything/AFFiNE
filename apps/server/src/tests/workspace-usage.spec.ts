import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ava, { TestFn } from 'ava';
import { stub } from 'sinon';

import { AppModule } from '../app';
import { UsersService } from '../modules/users';
import { PermissionService } from '../modules/workspaces/permission';
import { WorkspaceResolver } from '../modules/workspaces/resolver';
import { PrismaService } from '../prisma';
import { StorageProvide } from '../storage';
import { FakePrisma } from './utils';

class FakePermission {
  async tryCheck() {
    return true;
  }
  async getWorkspaceOwner() {
    return {
      user: new FakePrisma().fakeUser,
    };
  }
}

const fakeUserService = {
  getStorageQuotaById: stub(),
};

const test = ava as TestFn<{
  app: INestApplication;
  resolver: WorkspaceResolver;
}>;

test.beforeEach(async t => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      userWorkspacePermission: {
        async findMany() {
          return [];
        },
      },
    })
    .overrideProvider(PermissionService)
    .useClass(FakePermission)
    .overrideProvider(UsersService)
    .useValue(fakeUserService)
    .overrideProvider(StorageProvide)
    .useValue({
      blobsSize() {
        return 1024 * 10;
      },
    })
    .compile();
  t.context.app = module.createNestApplication();
  t.context.resolver = t.context.app.get(WorkspaceResolver);
  await t.context.app.init();
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should get blob size limit', async t => {
  const { resolver } = t.context;
  fakeUserService.getStorageQuotaById.returns(
    Promise.resolve(100 * 1024 * 1024 * 1024)
  );
  const res = await resolver.checkBlobSize(new FakePrisma().fakeUser, '', 100);
  t.not(res, false);
  // @ts-expect-error
  t.is(typeof res.size, 'number');
  fakeUserService.getStorageQuotaById.reset();
});
