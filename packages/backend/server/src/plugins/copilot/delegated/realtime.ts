import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { EventBus } from '../../../base';
import { RealtimeRegistry, realtimeUserRoom } from '../../../core/realtime';
import { ChatSessionService } from '../session';
import { DelegatedEditorService } from './service';

const identity = {
  requestId: z.string().uuid(),
  runId: z.string().uuid(),
  toolCallId: z.string().min(1).max(256),
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1),
  docId: z.string().min(1),
  clientId: z.string().min(1).max(128),
  editorStateId: z.string().min(1).max(128),
};
const responseSchema = z
  .object({
    ...identity,
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.string().min(1).max(64),
        message: z.string().max(500),
        retryable: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    response =>
      (response.result !== undefined) !== (response.error !== undefined),
    { message: 'Exactly one of result or error is required.' }
  )
  .refine(
    response =>
      Buffer.byteLength(JSON.stringify(response.result ?? null)) <= 512 * 1024,
    { message: 'Delegated tool result is too large.' }
  );

@Injectable()
export class DelegatedEditorRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly registry: RealtimeRegistry,
    private readonly event: EventBus,
    private readonly sessions: ChatSessionService,
    private readonly delegated: DelegatedEditorService
  ) {}

  onModuleInit() {
    const leaseInput = z
      .object({
        clientId: z.string().min(1).max(128),
        sessionId: z.string().min(1),
        workspaceId: z.string().min(1),
        docId: z.string().min(1),
        editorStateId: z.string().min(1).max(128),
        mode: z.enum(['page', 'edgeless']),
        readonly: z.boolean(),
        focused: z.boolean(),
        capabilities: z
          .array(
            z.enum([
              'frontend_get_editor_state',
              'frontend_read_selection',
              'frontend_read_nodes',
              'frontend_snapshot_document',
            ])
          )
          .max(4),
      })
      .strict();
    this.registry.registerRequest({
      name: 'copilot.delegated.editor.upsert',
      input: leaseInput,
      handle: async (user, input, context) => {
        const session = await this.sessions.get(input.sessionId);
        if (
          !user ||
          !context?.connectionId ||
          !session ||
          session.config.userId !== user.id ||
          session.config.workspaceId !== input.workspaceId ||
          session.config.docId !== input.docId
        ) {
          throw new Error('INVALID_DELEGATED_EDITOR_SESSION');
        }
        const lease = this.delegated.upsert(
          user.id,
          context.connectionId,
          input
        );
        this.event.broadcast('copilot.delegated.editor.upserted', lease);
        return { ok: true, expiresAt: lease.expiresAt };
      },
    });
    this.registry.registerRequest({
      name: 'copilot.delegated.editor.release',
      input: z
        .object({
          clientId: z.string().min(1).max(128),
          editorStateId: z.string().min(1).max(128),
        })
        .strict(),
      handle: async (user, input) => {
        if (user) {
          this.delegated.release(user.id, input.clientId, input.editorStateId);
          this.event.broadcast('copilot.delegated.editor.released', {
            userId: user.id,
            ...input,
          });
        }
        return { ok: true };
      },
    });
    this.registry.registerRequest({
      name: 'copilot.delegated.tool.respond',
      input: responseSchema,
      handle: async (user, response) => {
        if (!user) return { accepted: false };
        const accepted = this.delegated.receive(user.id, response);
        this.event.broadcast('copilot.delegated.tool.responded', {
          userId: user.id,
          response,
        });
        return { accepted };
      },
    });
    this.registry.registerTopic({
      name: 'copilot.delegated.tool.requested',
      input: z.object({ clientId: z.string().min(1).max(128) }).strict(),
      authorize: async user => {
        if (!user) throw new Error('AUTHENTICATION_REQUIRED');
      },
      room: (user, input) => {
        if (!user) throw new Error('AUTHENTICATION_REQUIRED');
        return realtimeUserRoom(user.id, `copilot:${input.clientId}`);
      },
    });
  }
}
