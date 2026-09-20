import { DocRole } from '../../models';
import { Mocker } from './factory';

export type MockDocUserInput = {
  workspaceId: string;
  docId: string;
  userId: string;
  type: DocRole;
};

export type MockedDocUser = MockDocUserInput & { createdAt: Date };

export class MockDocUser extends Mocker<MockDocUserInput, MockedDocUser> {
  override async create(input: MockDocUserInput) {
    const grant = await this.db.docGrant.create({
      data: {
        workspaceId: input.workspaceId,
        docId: input.docId,
        principalType: 'user',
        principalId: input.userId,
        role:
          input.type === DocRole.Owner
            ? 'owner'
            : input.type === DocRole.Manager
              ? 'manager'
              : input.type === DocRole.Editor
                ? 'editor'
                : input.type === DocRole.Commenter
                  ? 'commenter'
                  : 'reader',
      },
    });
    return { ...input, createdAt: grant.createdAt };
  }
}
