import { faker } from '@faker-js/faker';
import { hashSync } from '@node-rs/argon2';
import type { Prisma, User } from '@prisma/client';

import type { UserFeatureName } from '../../models';
import { Mocker } from './factory';

export type MockUserInput = Prisma.UserCreateInput & {
  feature?: UserFeatureName;
};

export type MockedUser = Omit<User, 'password'> & {
  password: string;
};

export class MockUser extends Mocker<MockUserInput, MockedUser> {
  override async create(input?: Partial<MockUserInput>) {
    const password = input?.password ?? faker.internet.password();
    const user = await this.db.user.create({
      data: {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        password: password ? hashSync(password) : undefined,
        ...input,
      },
    });

    if (input?.feature) {
      const feature = await this.db.feature.findFirst({
        where: {
          name: input.feature,
        },
      });

      if (!feature) {
        throw new Error(
          `Feature ${input.feature} does not exist in DB. You might forgot to run data-migration first.`
        );
      }

      await this.db.userFeature.create({
        data: {
          userId: user.id,
          featureId: feature.id,
          reason: 'test',
          activated: true,
        },
      });
    }

    // return raw password for later usage, for example 'signIn'
    return { ...user, password };
  }
}
