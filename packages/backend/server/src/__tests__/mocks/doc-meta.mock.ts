import type { WorkspaceDoc } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { Mocker } from './factory';

export type MockDocMetaInput = Prisma.WorkspaceDocUncheckedCreateInput;

export type MockedDocMeta = WorkspaceDoc;

export class MockDocMeta extends Mocker<MockDocMetaInput, MockedDocMeta> {
  override async create(input: MockDocMetaInput) {
    return await this.db.workspaceDoc.create({
      data: input,
    });
  }
}
