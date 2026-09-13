import type { WorkspaceDoc } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { DocRole } from '../../models';
import { Mocker } from './factory';

export type MockDocMetaInput = Prisma.WorkspaceDocUncheckedCreateInput & {
  public?: boolean;
  defaultRole?: DocRole;
};

export type MockedDocMeta = WorkspaceDoc & {
  public: boolean;
  defaultRole: DocRole;
};

export class MockDocMeta extends Mocker<MockDocMetaInput, MockedDocMeta> {
  override async create(input: MockDocMetaInput) {
    const {
      public: isPublic = false,
      defaultRole = DocRole.Manager,
      ...meta
    } = input;
    const publishedAt = isPublic ? (meta.publishedAt ?? new Date()) : null;
    const doc = await this.db.workspaceDoc.create({
      data: { ...meta, publishedAt },
    });
    await this.db.docAccessPolicy.create({
      data: {
        workspaceId: input.workspaceId,
        docId: input.docId,
        visibility: isPublic ? 'public' : 'private',
        publicRole: isPublic ? 'external' : null,
        publishedAt,
        memberDefaultRole:
          defaultRole === DocRole.None
            ? 'none'
            : defaultRole === DocRole.Reader
              ? 'reader'
              : defaultRole === DocRole.Commenter
                ? 'commenter'
                : defaultRole === DocRole.Editor
                  ? 'editor'
                  : defaultRole === DocRole.Owner
                    ? 'owner'
                    : 'manager',
      },
    });
    return { ...doc, public: isPublic, defaultRole };
  }
}
