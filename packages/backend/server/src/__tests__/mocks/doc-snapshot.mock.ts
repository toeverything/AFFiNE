import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { faker } from '@faker-js/faker';
import type { Snapshot } from '@prisma/client';

import { Mocker } from './factory';

export type MockDocSnapshotInput = {
  user: { id: string };
  workspaceId: string;
  docId?: string;
  blob?: Uint8Array;
  updatedAt?: Date;
  snapshotFile?: string;
};

export type MockedDocSnapshot = Snapshot;

export class MockDocSnapshot extends Mocker<
  MockDocSnapshotInput,
  MockedDocSnapshot
> {
  override async create(input: MockDocSnapshotInput) {
    if (!input.blob) {
      const snapshot = await readFile(
        path.join(
          import.meta.dirname,
          `../__fixtures__/${input.snapshotFile ?? 'test-doc.snapshot.bin'}`
        )
      );
      input.blob = snapshot;
    }
    const snapshot = await this.db.snapshot.create({
      data: {
        id: input.docId ?? faker.string.nanoid(),
        workspaceId: input.workspaceId,
        blob: input.blob,
        createdAt: new Date(),
        updatedAt: input.updatedAt ?? new Date(),
        createdBy: input.user.id,
        updatedBy: input.user.id,
      },
    });
    return snapshot;
  }
}
