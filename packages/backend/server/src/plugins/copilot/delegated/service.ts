import { randomUUID } from 'node:crypto';

import type {
  DelegatedEditorLeaseInput,
  DelegatedToolIdentity,
  DelegatedToolName,
  DelegatedToolResponse,
} from '@affine/realtime';
import { Injectable } from '@nestjs/common';

import { OnEvent } from '../../../base';
import { RealtimePublisher, realtimeUserRoom } from '../../../core/realtime';
import type { CopilotChatOptions } from '../providers/types';

type EditorLease = DelegatedEditorLeaseInput & {
  userId: string;
  connectionId: string;
  expiresAt: number;
};

type PendingRequest = {
  identity: DelegatedToolIdentity;
  userId: string;
  connectionId: string;
  resolve: (response: DelegatedToolResponse) => void;
};

declare global {
  interface Events {
    'copilot.delegated.editor.upserted': EditorLease;
    'copilot.delegated.editor.released': {
      userId: string;
      clientId: string;
      editorStateId: string;
    };
    'copilot.delegated.tool.responded': {
      userId: string;
      response: DelegatedToolResponse;
    };
  }
}

const LEASE_TTL_MS = 30_000;
const TOOL_TIMEOUT_MS = 15_000;

@Injectable()
export class DelegatedEditorService {
  private readonly leases = new Map<string, EditorLease>();
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly publisher: RealtimePublisher) {}

  leaseKey(userId: string, clientId: string) {
    return `${userId}:${clientId}`;
  }

  upsert(
    userId: string,
    connectionId: string,
    input: DelegatedEditorLeaseInput
  ) {
    const lease = {
      ...input,
      userId,
      connectionId,
      expiresAt: Date.now() + LEASE_TTL_MS,
    };
    this.leases.set(this.leaseKey(userId, input.clientId), lease);
    return lease;
  }

  release(userId: string, clientId: string, editorStateId: string) {
    const key = this.leaseKey(userId, clientId);
    const lease = this.leases.get(key);
    if (lease?.editorStateId === editorStateId) {
      this.leases.delete(key);
    }
  }

  getLease(options: CopilotChatOptions, tool?: DelegatedToolName) {
    if (!options?.user || !options.session || !options.workspace) return null;
    const now = Date.now();
    let selected: EditorLease | null = null;
    for (const [key, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.leases.delete(key);
        continue;
      }
      if (
        lease.userId === options.user &&
        lease.sessionId === options.session &&
        lease.workspaceId === options.workspace &&
        lease.focused &&
        (!tool || lease.capabilities.includes(tool)) &&
        (!selected || lease.expiresAt > selected.expiresAt)
      ) {
        selected = lease;
      }
    }
    return selected;
  }

  async execute(
    options: CopilotChatOptions,
    tool: DelegatedToolName,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    execution?: { runId?: string; toolCallId?: string }
  ) {
    const lease = this.getLease(options, tool);
    if (!lease) {
      return {
        error: {
          code: 'FRONTEND_UNAVAILABLE',
          message: 'No focused editor is available for this session.',
          retryable: true,
        },
      };
    }

    const identity = {
      requestId: randomUUID(),
      runId: execution?.runId ?? randomUUID(),
      toolCallId: execution?.toolCallId ?? randomUUID(),
      sessionId: lease.sessionId,
      workspaceId: lease.workspaceId,
      docId: lease.docId,
      clientId: lease.clientId,
      editorStateId: lease.editorStateId,
    };
    const deadlineAt = Date.now() + TOOL_TIMEOUT_MS;
    const response = new Promise<DelegatedToolResponse>(resolve => {
      this.pending.set(identity.requestId, {
        identity,
        userId: lease.userId,
        connectionId: lease.connectionId,
        resolve,
      });
    });
    this.publisher.publish(
      'copilot.delegated.tool.requested',
      { clientId: lease.clientId },
      { type: 'request', ...identity, tool, args, deadlineAt },
      { room: realtimeUserRoom(lease.userId, `copilot:${lease.clientId}`) }
    );

    let reason: 'aborted' | 'timeout' | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const interrupted = new Promise<DelegatedToolResponse>(resolve => {
      timeout = setTimeout(() => {
        reason = 'timeout';
        resolve({
          ...identity,
          error: {
            code: 'FRONTEND_TIMEOUT',
            message: 'The focused editor did not respond before the deadline.',
            retryable: true,
          },
        });
      }, TOOL_TIMEOUT_MS);
      timeout.unref?.();
      abort = () => {
        reason = 'aborted';
        resolve({
          ...identity,
          error: {
            code: 'ABORTED',
            message: 'The delegated read was cancelled.',
            retryable: false,
          },
        });
      };
      if (signal?.aborted) {
        abort();
      } else {
        signal?.addEventListener('abort', abort, { once: true });
      }
    });

    const result = await Promise.race([response, interrupted]);
    this.pending.delete(identity.requestId);
    if (timeout) clearTimeout(timeout);
    if (abort) signal?.removeEventListener('abort', abort);
    if (reason) {
      this.publisher.publish(
        'copilot.delegated.tool.requested',
        { clientId: lease.clientId },
        { type: 'cancel', ...identity, reason },
        { room: realtimeUserRoom(lease.userId, `copilot:${lease.clientId}`) }
      );
    }
    if (result.error) return { error: result.error };
    if (
      tool === 'frontend_get_editor_state' ||
      !result.result ||
      typeof result.result !== 'object' ||
      Array.isArray(result.result)
    ) {
      return result.result;
    }
    return {
      ...result.result,
      source: {
        type: 'document',
        workspace_id: lease.workspaceId,
        doc_id: lease.docId,
        revision: lease.editorStateId,
      },
    };
  }

  receive(userId: string, response: DelegatedToolResponse) {
    const request = this.pending.get(response.requestId);
    if (
      !request ||
      request.userId !== userId ||
      !this.sameIdentity(request.identity, response) ||
      !this.validResult(request.identity, response)
    ) {
      return false;
    }
    this.pending.delete(response.requestId);
    request.resolve(response);
    return true;
  }

  @OnEvent('copilot.delegated.editor.upserted', { suppressError: true })
  onRemoteUpsert(lease: Events['copilot.delegated.editor.upserted']) {
    this.leases.set(this.leaseKey(lease.userId, lease.clientId), lease);
  }

  @OnEvent('copilot.delegated.editor.released', { suppressError: true })
  onRemoteRelease(event: Events['copilot.delegated.editor.released']) {
    this.release(event.userId, event.clientId, event.editorStateId);
  }

  @OnEvent('copilot.delegated.tool.responded', { suppressError: true })
  onRemoteResponse(event: Events['copilot.delegated.tool.responded']) {
    this.receive(event.userId, event.response);
  }

  @OnEvent('realtime.connection.disconnected', { suppressError: true })
  onDisconnect({ connectionId }: Events['realtime.connection.disconnected']) {
    for (const [key, lease] of this.leases) {
      if (lease.connectionId === connectionId) {
        this.leases.delete(key);
      }
    }
    for (const [requestId, request] of this.pending) {
      if (request.connectionId !== connectionId) continue;
      this.pending.delete(requestId);
      request.resolve({
        ...request.identity,
        error: {
          code: 'FRONTEND_DISCONNECTED',
          message: 'The focused editor disconnected during the read.',
          retryable: true,
        },
      });
      this.publisher.publish(
        'copilot.delegated.tool.requested',
        { clientId: request.identity.clientId },
        { type: 'cancel', ...request.identity, reason: 'disconnect' },
        {
          room: realtimeUserRoom(
            request.userId,
            `copilot:${request.identity.clientId}`
          ),
        }
      );
    }
  }

  private sameIdentity(
    expected: DelegatedToolIdentity,
    actual: DelegatedToolIdentity
  ) {
    return (
      expected.requestId === actual.requestId &&
      expected.runId === actual.runId &&
      expected.toolCallId === actual.toolCallId &&
      expected.sessionId === actual.sessionId &&
      expected.workspaceId === actual.workspaceId &&
      expected.docId === actual.docId &&
      expected.clientId === actual.clientId &&
      expected.editorStateId === actual.editorStateId
    );
  }

  private validResult(
    identity: DelegatedToolIdentity,
    response: DelegatedToolResponse
  ) {
    if (response.error) return true;
    return Boolean(
      response.result &&
      typeof response.result === 'object' &&
      'editor_state_id' in response.result &&
      response.result.editor_state_id === identity.editorStateId
    );
  }
}
