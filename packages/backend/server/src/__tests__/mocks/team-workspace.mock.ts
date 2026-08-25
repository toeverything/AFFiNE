import { faker } from '@faker-js/faker';

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

    await this.db.entitlement.create({
      data: {
        targetType: 'workspace',
        targetId: id,
        source: 'cloud_subscription',
        plan: 'team',
        status: 'active',
        quantity,
      },
    });

    return { id };
  }
}
