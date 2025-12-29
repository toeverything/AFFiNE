import { faker } from '@faker-js/faker';

import { Feature, FeatureType } from '../../models';
import { Mocker } from './factory';

interface MockTeamWorkspaceInput {
  id: string;
  quantity: number;
}

export class MockTeamWorkspace extends Mocker<
  MockTeamWorkspaceInput,
  { id: string }
> {
  override async create(input?: Partial<MockTeamWorkspaceInput>) {
    const id = input?.id ?? faker.string.uuid();
    const quantity = input?.quantity ?? 10;

    await this.db.subscription.create({
      data: {
        targetId: id,
        plan: 'team',
        recurring: 'monthly',
        status: 'active',
        start: faker.date.past(),
        nextBillAt: faker.date.future(),
        quantity,
      },
    });

    await this.db.workspaceFeature.create({
      data: {
        workspaceId: id,
        reason: 'test',
        activated: true,
        name: Feature.TeamPlan,
        type: FeatureType.Quota,
        configs: {
          memberLimit: quantity,
        },
      },
    });

    return { id };
  }
}
