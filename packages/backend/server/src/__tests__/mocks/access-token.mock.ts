import { faker } from '@faker-js/faker';
import type { AccessToken } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { Mocker } from './factory';

export type MockAccessTokenInput = Omit<
  Prisma.AccessTokenUncheckedCreateInput,
  'token'
>;

export type MockedAccessToken = AccessToken;

export class MockAccessToken extends Mocker<
  MockAccessTokenInput,
  MockedAccessToken
> {
  override async create(input: MockAccessTokenInput) {
    return await this.db.accessToken.create({
      data: {
        ...input,
        name: input.name ?? faker.lorem.word(),
        token: 'ut_' + faker.string.hexadecimal({ length: 37 }),
      },
    });
  }
}
