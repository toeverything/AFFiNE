import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { faker } from '@faker-js/faker';
import type { Prisma } from '@prisma/client';
import { omit } from 'lodash-es';

import type { Workspace } from '../../models';
import { Mocker } from './factory';

export type MockWorkspaceInput = Prisma.WorkspaceCreateInput & {
  owner?: { id: string };
  snapshot?: Uint8Array | true;
  public?: boolean;
  enableSharing?: boolean;
  enableUrlPreview?: boolean;
};

export type MockedWorkspace = Workspace;

export class MockWorkspace extends Mocker<MockWorkspaceInput, MockedWorkspace> {
  override async create(input?: Partial<MockWorkspaceInput>) {
    const owner = input?.owner;
    if (input?.snapshot === true) {
      const snapshot = await readFile(
        path.join(
          import.meta.dirname,
          '../__fixtures__/test-root-doc.snapshot.bin'
        )
      );
      input.snapshot = snapshot;
    }
    const snapshot = input?.snapshot;
    const isPublic = input?.public ?? false;
    const enableSharing = input?.enableSharing ?? true;
    const enableUrlPreview = input?.enableUrlPreview ?? false;
    input = omit(
      input,
      'owner',
      'snapshot',
      'public',
      'enableSharing',
      'enableUrlPreview'
    );
    const workspace = await this.db.workspace.create({
      data: {
        name: faker.animal.cat(),
        ...input,
        accessPolicy: {
          create: {
            visibility: isPublic ? 'public' : 'private',
            sharingEnabled: enableSharing,
            urlPreviewEnabled: enableUrlPreview,
          },
        },
        members: owner
          ? {
              create: {
                userId: owner.id,
                role: 'owner',
                state: 'active',
                source: 'legacy',
              },
            }
          : undefined,
      },
    });
    await this.db.effectiveWorkspaceQuotaState.create({
      data: {
        workspaceId: workspace.id,
        plan: 'free',
        seatLimit: 0,
        blobLimit: 0,
        storageQuota: 0,
        historyPeriodSeconds: 0,
        known: true,
      },
    });

    // create a rootDoc snapshot
    if (snapshot) {
      await this.db.snapshot.create({
        data: {
          id: workspace.id,
          workspaceId: workspace.id,
          blob: snapshot,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: owner?.id,
          updatedBy: owner?.id,
        },
      });
    }
    return {
      ...workspace,
      public: isPublic,
      enableSharing,
      enableUrlPreview,
    };
  }
}
