import { faker } from '@faker-js/faker';
import { hashSync } from '@node-rs/argon2';
import type { Prisma, User } from '@prisma/client';

import { FeatureConfigs, type UserFeatureName } from '../../models';
import { Mocker } from './factory';

export type MockUserInput = Prisma.UserCreateInput & {
  feature?: UserFeatureName;
};

export type MockedUser = Omit<User, 'password'> & {
  password: string;
};

export class MockUser extends Mocker<MockUserInput, MockedUser> {
  override async create(input?: Partial<MockUserInput>) {
    const { feature, ...userInput } = input ?? {};
    const password = input?.password ?? faker.internet.password();
    const user = await this.db.user.create({
      data: {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        password: password ? hashSync(password) : undefined,
        ...userInput,
      },
    });

    if (feature) {
      const featureRecord = await this.db.feature.findFirst({
        where: {
          name: feature,
        },
      });

      if (!featureRecord) {
        throw new Error(
          `Feature ${feature} does not exist in DB. You might forgot to run data-migration first.`
        );
      }

      const config = FeatureConfigs[feature];
      await this.db.userFeature.create({
        data: {
          userId: user.id,
          featureId: featureRecord.id,
          name: feature,
          type: config.type,
          reason: 'test',
          activated: true,
        },
      });
    }

    // return raw password for later usage, for example 'signIn'
    return { ...user, password };
  }
}
