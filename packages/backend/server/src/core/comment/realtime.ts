import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { decodeWithJson, encodeWithJson } from '../../base/graphql';
import { DocReader } from '../doc/reader';
import { PermissionAccess } from '../permission';
import {
  realtimeCommentRoom,
  RealtimeRegistry,
  registerRealtimeLiveQuery,
} from '../realtime';
import type { CommentCursor } from './resolver';
import { CommentService } from './service';

export function commentRoom(workspaceId: string, docId: string) {
  return realtimeCommentRoom(workspaceId, docId);
}

@Injectable()
export class CommentRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly service: CommentService,
    private readonly ac: PermissionAccess,
    private readonly registry: RealtimeRegistry,
    private readonly docReader: DocReader
  ) {}

  onModuleInit() {
    const input = z.object({
      workspaceId: z.string(),
      docId: z.string(),
      after: z.string().optional(),
      first: z.number().optional(),
    });

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'comment.changes.get',
        input,
        handle: async (user, payload) => {
          const docId = await this.docReader.resolveStorageDocId(
            payload.workspaceId,
            payload.docId
          );
          await this.assertRead(user.id, payload.workspaceId, docId);
          const cursor: CommentCursor = decodeWithJson(payload.after) ?? {};
          const limit = payload.first;
          const changes = await this.service.listCommentChanges(
            payload.workspaceId,
            docId,
            {
              commentUpdatedAt: cursor.commentUpdatedAt,
              replyUpdatedAt: cursor.replyUpdatedAt,
              take: limit ? limit + 1 : undefined,
            }
          );
          const pageChanges = limit ? changes.slice(0, limit) : changes;
          const endCursor = cursor;
          for (const change of pageChanges) {
            if (change.commentId) {
              endCursor.replyUpdatedAt = change.item.updatedAt;
            } else {
              endCursor.commentUpdatedAt = change.item.updatedAt;
            }
          }
          return {
            changes: pageChanges.map(change => ({
              id: change.id,
              action: change.action,
              item: change.item,
              commentId: change.commentId ?? null,
            })),
            startCursor: '',
            endCursor: encodeWithJson(endCursor),
            hasNextPage: limit ? changes.length > limit : false,
          };
        },
      },
      topic: {
        name: 'comment.changed',
        input: z.object({
          workspaceId: z.string(),
          docId: z.string(),
        }),
        authorize: async (user, payload) => {
          const docId = await this.docReader.resolveStorageDocId(
            payload.workspaceId,
            payload.docId
          );
          await this.assertRead(user.id, payload.workspaceId, docId);
        },
        room: (_user, payload) =>
          commentRoom(payload.workspaceId, payload.docId),
      },
    });
  }

  private async assertRead(userId: string, workspaceId: string, docId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .doc(docId)
      .assert('Doc.Comments.Read');
  }
}
