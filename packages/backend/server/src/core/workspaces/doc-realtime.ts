import type {
  DocShareStateSnapshot,
  PaginatedDocGrantedUsersSnapshot,
} from '@affine/realtime';
import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import { OnEvent, PaginationInput } from '../../base';
import { DocRole, Models, PublicDocMode } from '../../models';
import { PermissionAccess } from '../permission';
import { registerRealtimeLiveQuery } from '../realtime/provider';
import { RealtimePublisher } from '../realtime/publisher';
import { RealtimeRegistry } from '../realtime/registry';
import {
  realtimeDocGrantsRoom,
  realtimeDocShareStateRoom,
} from '../realtime/rooms';
import { DocGrantsService } from './doc-grants';

const docInput = z
  .object({ workspaceId: z.string(), docId: z.string() })
  .strict();

@Injectable()
export class DocShareRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    @Optional() private readonly registry?: RealtimeRegistry,
    @Optional() private readonly publisher?: RealtimePublisher
  ) {}

  onModuleInit() {
    if (!this.registry) return;

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'doc.share-state.get',
        input: docInput,
        handle: async (user, input) => ({
          state: await this.getShareState(
            user.id,
            input.workspaceId,
            input.docId
          ),
        }),
      },
      topic: {
        name: 'doc.share-state.changed',
        input: docInput,
        authorize: async (user, input) => {
          await this.assertRead(user.id, input.workspaceId, input.docId);
        },
        room: (_user, input) =>
          realtimeDocShareStateRoom(input.workspaceId, input.docId),
      },
    });
  }

  @OnEvent('doc.public_state.changed', { suppressError: true })
  onPublicStateChanged({
    workspaceId,
    docId,
  }: Events['doc.public_state.changed']) {
    this.publish(workspaceId, docId, 'public-state-changed');
  }

  @OnEvent('doc.default_role.changed', { suppressError: true })
  onDefaultRoleChanged({
    workspaceId,
    docId,
  }: Events['doc.default_role.changed']) {
    this.publish(workspaceId, docId, 'default-role-changed');
  }

  private async getShareState(
    userId: string,
    workspaceId: string,
    docId: string
  ): Promise<DocShareStateSnapshot | null> {
    await this.assertRead(userId, workspaceId, docId);
    const doc = await this.models.doc.getDocInfo(workspaceId, docId);
    if (!doc) {
      return null;
    }
    return {
      public: doc.public,
      mode: PublicDocMode[doc.mode],
      defaultRole: DocRole[doc.defaultRole],
    };
  }

  private async assertRead(userId: string, workspaceId: string, docId: string) {
    await this.ac.user(userId).doc(workspaceId, docId).assert('Doc.Read');
  }

  private publish(workspaceId: string, docId: string, reason: string) {
    this.publisher?.publishChanged(
      'doc.share-state.changed',
      { workspaceId, docId },
      reason,
      { room: realtimeDocShareStateRoom(workspaceId, docId) }
    );
  }
}

@Injectable()
export class DocGrantsRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    private readonly grants: DocGrantsService,
    @Optional() private readonly registry?: RealtimeRegistry,
    @Optional() private readonly publisher?: RealtimePublisher
  ) {}

  onModuleInit() {
    if (!this.registry) return;

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'doc.grants.get',
        input: z
          .object({
            workspaceId: z.string(),
            docId: z.string(),
            pagination: z
              .object({
                first: z.number().int().positive(),
                offset: z.number().int().nonnegative().optional(),
                after: z.string().optional(),
              })
              .strict(),
          })
          .strict(),
        handle: async (user, input) =>
          this.getGrants(user.id, input.workspaceId, input.docId, {
            first: input.pagination.first,
            offset: input.pagination.offset ?? 0,
            after: input.pagination.after,
          }),
      },
      topic: {
        name: 'doc.grants.changed',
        input: docInput,
        authorize: async (user, input) => {
          await this.assertRead(user.id, input.workspaceId, input.docId);
        },
        room: (_user, input) =>
          realtimeDocGrantsRoom(input.workspaceId, input.docId),
      },
    });
  }

  @OnEvent('doc.grants.changed', { suppressError: true })
  onGrantsChanged({ workspaceId, docId }: Events['doc.grants.changed']) {
    this.publish(workspaceId, docId, 'grants-changed');
  }

  @OnEvent('doc.owner.changed', { suppressError: true })
  onOwnerChanged({ workspaceId, docId }: Events['doc.owner.changed']) {
    this.publish(workspaceId, docId, 'owner-changed');
  }

  @OnEvent('user.updated', { suppressError: true })
  async onUserUpdated(user: Events['user.updated']) {
    const grants = await this.models.docUser.findDirectGrantDocIdsByUser(
      user.id
    );
    for (const grant of grants) {
      this.publish(grant.workspaceId, grant.docId, 'user-updated');
    }
  }

  private async getGrants(
    userId: string,
    workspaceId: string,
    docId: string,
    input: PaginationInput
  ): Promise<PaginatedDocGrantedUsersSnapshot> {
    await this.assertRead(userId, workspaceId, docId);
    const pagination = PaginationInput.decode.transform(input, {} as never);
    const page = await this.grants.paginateGrantedUsers(
      workspaceId,
      docId,
      pagination
    );

    return {
      totalCount: page.totalCount,
      pageInfo: {
        endCursor: page.pageInfo.endCursor ?? null,
        hasNextPage: page.pageInfo.hasNextPage,
      },
      edges: page.edges.map(edge => ({
        node: {
          role: DocRole[edge.node.type],
          user: {
            id: edge.node.user.id,
            name: edge.node.user.name,
            email: edge.node.user.email,
            avatarUrl: edge.node.user.avatarUrl ?? null,
          },
        },
      })),
    };
  }

  private async assertRead(userId: string, workspaceId: string, docId: string) {
    await this.ac.user(userId).doc(workspaceId, docId).assert('Doc.Users.Read');
  }

  private publish(workspaceId: string, docId: string, reason: string) {
    this.publisher?.publishChanged(
      'doc.grants.changed',
      { workspaceId, docId },
      reason,
      { room: realtimeDocGrantsRoom(workspaceId, docId) }
    );
  }
}
