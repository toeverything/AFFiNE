import {
  applyUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
} from 'yjs';

import type {
  DocLifecycle,
  LoadedDoc,
  PushResult,
  SpaceType,
} from '../domain/doc.js';
import { docKey, isSpaceType } from '../domain/doc.js';
import type { DocHistoryRecord } from '../domain/blob.js';
import { AppError, errors } from '../domain/errors.js';
import type { User, WorkspaceRole } from '../domain/identity.js';
import type { Clock, DocStore, WorkspaceStore } from '../domain/ports.js';
import { sha256Bytes } from './crypto.js';
import { KeyedMutex } from './mutex.js';

export interface DocServiceConfig {
  compactUpdateCount: number;
  maxUpdateBytes: number;
  historyLimit: number;
}

export interface Access {
  role: WorkspaceRole | 'self';
  canWrite: boolean;
}

function canWrite(role: WorkspaceRole | 'self'): boolean {
  return (
    role === 'owner' ||
    role === 'admin' ||
    role === 'collaborator' ||
    role === 'self'
  );
}

export class DocService {
  private readonly locks = new KeyedMutex();

  constructor(
    private readonly docs: DocStore,
    private readonly workspaces: WorkspaceStore,
    private readonly clock: Clock,
    private readonly config: DocServiceConfig
  ) {}

  async authorize(
    user: User,
    spaceType: string,
    spaceId: string
  ): Promise<Access> {
    if (!isSpaceType(spaceType)) {
      throw errors.invalidSpaceType();
    }
    if (spaceType === 'userspace') {
      if (spaceId !== user.id) {
        throw errors.spaceAccessDenied(spaceId);
      }
      return { role: 'self', canWrite: true };
    }
    const workspace = await this.workspaces.getWorkspace(spaceId);
    if (!workspace) {
      throw errors.spaceNotFound();
    }
    const member = await this.workspaces.getMember(spaceId, user.id);
    if (!member) {
      throw errors.spaceAccessDenied(spaceId);
    }
    return { role: member.role, canWrite: canWrite(member.role) };
  }

  async requireWrite(
    user: User,
    spaceType: string,
    spaceId: string
  ): Promise<Access> {
    const access = await this.authorize(user, spaceType, spaceId);
    if (!access.canWrite) {
      throw errors.docActionDenied();
    }
    return access;
  }

  async load(
    user: User,
    input: {
      spaceType: string;
      spaceId: string;
      docId: string;
      stateVector?: Uint8Array;
    }
  ): Promise<LoadedDoc> {
    await this.authorize(user, input.spaceType, input.spaceId);
    const spaceType = input.spaceType as SpaceType;
    return this.locks.run(
      docKey(spaceType, input.spaceId, input.docId),
      async () => {
        const ydoc = await this.materialize(
          spaceType,
          input.spaceId,
          input.docId
        );
        const record = await this.docs.getDocument(
          spaceType,
          input.spaceId,
          input.docId
        );
        if (!record || record.lifecycle === 'deleted') {
          throw errors.docNotFound();
        }
        const missing = input.stateVector
          ? Uint8Array.from(encodeStateAsUpdate(ydoc, input.stateVector))
          : Uint8Array.from(encodeStateAsUpdate(ydoc));
        return {
          missing,
          state: Uint8Array.from(encodeStateVector(ydoc)),
          timestamp: record.timestamp,
        };
      }
    );
  }

  async push(
    user: User,
    input: {
      spaceType: string;
      spaceId: string;
      docId: string;
      update: Uint8Array;
    }
  ): Promise<PushResult> {
    await this.requireWrite(user, input.spaceType, input.spaceId);
    if (input.update.byteLength === 0) {
      throw errors.badRequest('Empty document update.');
    }
    if (input.update.byteLength > this.config.maxUpdateBytes) {
      throw errors.docUpdateTooLarge();
    }
    const spaceType = input.spaceType as SpaceType;
    const hash = sha256Bytes(input.update);
    return this.locks.run(
      docKey(spaceType, input.spaceId, input.docId),
      async () => {
        const existing = await this.docs.getDocument(
          spaceType,
          input.spaceId,
          input.docId
        );
        if (existing?.lifecycle === 'deleted') {
          throw errors.docNotFound();
        }
        try {
          const ydoc = new YDoc();
          if (existing?.snapshot && existing.snapshot.byteLength > 0) {
            applyUpdate(ydoc, existing.snapshot);
          }
          const pending = existing
            ? await this.docs.listUpdates(spaceType, input.spaceId, input.docId)
            : [];
          for (const update of pending) {
            applyUpdate(ydoc, update.payload);
          }
          applyUpdate(ydoc, input.update);
        } catch (error) {
          if (error instanceof AppError) {
            throw error;
          }
          throw errors.badRequest('Invalid Yjs update.');
        }
        const now = this.clock.now().getTime();
        const clock = Math.max(now, (existing?.timestamp ?? 0) + 1);
        const appended = await this.docs.appendUpdate({
          spaceType,
          spaceId: input.spaceId,
          docId: input.docId,
          clock,
          payload: input.update,
          payloadHash: hash,
        });
        if (appended.duplicate) {
          return {
            timestamp: appended.clock,
            duplicate: true,
            compacted: false,
          };
        }
        const nextCount = (existing?.updateCount ?? 0) + 1;
        await this.docs.upsertDocument({
          spaceType,
          spaceId: input.spaceId,
          docId: input.docId,
          snapshot: existing?.snapshot ?? null,
          timestamp: appended.clock,
          lifecycle: existing?.lifecycle ?? 'active',
          updateCount: nextCount,
        });
        let compacted = false;
        if (nextCount >= this.config.compactUpdateCount) {
          await this.compactUnlocked(
            spaceType,
            input.spaceId,
            input.docId,
            user.id
          );
          compacted = true;
        }
        return { timestamp: appended.clock, duplicate: false, compacted };
      }
    );
  }

  async timestamps(
    user: User,
    spaceType: string,
    spaceId: string,
    after?: number
  ): Promise<Record<string, number>> {
    await this.authorize(user, spaceType, spaceId);
    return this.docs.listTimestamps(spaceType as SpaceType, spaceId, after);
  }

  async delete(
    user: User,
    spaceType: string,
    spaceId: string,
    docId: string
  ): Promise<boolean> {
    await this.requireWrite(user, spaceType, spaceId);
    return this.locks.run(docKey(spaceType, spaceId, docId), async () =>
      this.docs.deleteDocument(spaceType as SpaceType, spaceId, docId)
    );
  }

  async applyLifecycle(
    user: User,
    input: {
      spaceType: string;
      spaceId: string;
      docId: string;
      lifecycle: DocLifecycle | 'restore' | 'delete' | 'trash';
    }
  ): Promise<{ rootUpdate: Uint8Array; timestamp: number }> {
    await this.requireWrite(user, input.spaceType, input.spaceId);
    const spaceType = input.spaceType as SpaceType;
    const next: DocLifecycle =
      input.lifecycle === 'restore' || input.lifecycle === 'active'
        ? 'active'
        : input.lifecycle === 'delete' || input.lifecycle === 'deleted'
          ? 'deleted'
          : 'trash';
    return this.locks.run(
      docKey(spaceType, input.spaceId, input.docId),
      async () => {
        const now = this.clock.now().getTime();
        if (next === 'deleted') {
          await this.docs.deleteDocument(spaceType, input.spaceId, input.docId);
        } else {
          const existing = await this.docs.getDocument(
            spaceType,
            input.spaceId,
            input.docId
          );
          if (!existing) {
            await this.docs.upsertDocument({
              spaceType,
              spaceId: input.spaceId,
              docId: input.docId,
              snapshot: null,
              timestamp: now,
              lifecycle: next,
              updateCount: 0,
            });
          } else {
            await this.docs.setLifecycle(
              spaceType,
              input.spaceId,
              input.docId,
              next,
              now
            );
          }
        }
        const root = await this.docs.getDocument(
          spaceType,
          input.spaceId,
          input.spaceId
        );
        let rootUpdate = new Uint8Array();
        if (root) {
          const ydoc = await this.materialize(
            spaceType,
            input.spaceId,
            input.spaceId
          );
          rootUpdate = Uint8Array.from(encodeStateAsUpdate(ydoc));
        }
        return { rootUpdate, timestamp: now };
      }
    );
  }

  async compact(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    editorId?: string
  ): Promise<void> {
    await this.locks.run(docKey(spaceType, spaceId, docId), () =>
      this.compactUnlocked(spaceType, spaceId, docId, editorId)
    );
  }

  async snapshotBytes(
    user: User,
    spaceType: string,
    spaceId: string,
    docId: string
  ): Promise<Uint8Array> {
    const loaded = await this.load(user, { spaceType, spaceId, docId });
    return loaded.missing;
  }

  async publicSnapshotBytes(
    workspaceId: string,
    docId: string
  ): Promise<Uint8Array> {
    return this.locks.run(docKey('workspace', workspaceId, docId), async () => {
      const ydoc = await this.materialize('workspace', workspaceId, docId);
      const record = await this.docs.getDocument(
        'workspace',
        workspaceId,
        docId
      );
      if (!record || record.lifecycle === 'deleted') {
        throw errors.docNotFound();
      }
      return Uint8Array.from(encodeStateAsUpdate(ydoc));
    });
  }

  async listHistories(
    user: User,
    workspaceId: string,
    docId: string,
    opts?: { take?: number; before?: Date | number }
  ): Promise<DocHistoryRecord[]> {
    await this.authorize(user, 'workspace', workspaceId);
    const before =
      opts?.before instanceof Date ? opts.before.getTime() : opts?.before;
    return this.docs.listHistories('workspace', workspaceId, docId, {
      ...(opts?.take !== undefined ? { take: opts.take } : {}),
      ...(before !== undefined ? { before } : {}),
    });
  }

  async historyBytes(
    user: User,
    workspaceId: string,
    docId: string,
    timestamp: number
  ): Promise<Uint8Array> {
    await this.authorize(user, 'workspace', workspaceId);
    const record = await this.docs.getHistory(
      'workspace',
      workspaceId,
      docId,
      timestamp
    );
    if (!record) {
      throw errors.historyNotFound(workspaceId, docId, timestamp);
    }
    return Uint8Array.from(record.snapshot);
  }

  async recover(
    user: User,
    workspaceId: string,
    docId: string,
    timestamp: Date | number
  ): Promise<Date> {
    await this.requireWrite(user, 'workspace', workspaceId);
    const ts = timestamp instanceof Date ? timestamp.getTime() : timestamp;
    return this.locks.run(docKey('workspace', workspaceId, docId), async () => {
      const record = await this.docs.getHistory(
        'workspace',
        workspaceId,
        docId,
        ts
      );
      if (!record) {
        throw errors.historyNotFound(workspaceId, docId, ts);
      }
      await this.docs.compactDocument({
        spaceType: 'workspace',
        spaceId: workspaceId,
        docId,
        snapshot: record.snapshot,
        timestamp: record.timestamp,
      });
      return new Date(record.timestamp);
    });
  }

  private async compactUnlocked(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    editorId?: string
  ): Promise<void> {
    const record = await this.docs.getDocument(spaceType, spaceId, docId);
    if (!record) {
      return;
    }
    const ydoc = await this.materialize(spaceType, spaceId, docId);
    const snapshot = Uint8Array.from(encodeStateAsUpdate(ydoc));
    // Persist the history snapshot *before* compacting away the raw
    // updates it was derived from: if the process crashes in between, the
    // worst case is a redundant history entry next run, never data loss
    // (the reverse order could otherwise delete updates whose only
    // materialized copy never made it to disk).
    await this.docs.saveHistory({
      spaceType,
      spaceId,
      docId,
      timestamp: record.timestamp,
      snapshot,
      editorId: editorId ?? null,
    });
    await this.docs.compactDocument({
      spaceType,
      spaceId,
      docId,
      snapshot,
      timestamp: record.timestamp,
    });
    await this.docs.trimHistories(
      spaceType,
      spaceId,
      docId,
      this.config.historyLimit
    );
  }

  private async materialize(
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ): Promise<YDoc> {
    const record = await this.docs.getDocument(spaceType, spaceId, docId);
    if (!record) {
      throw errors.docNotFound();
    }
    const ydoc = new YDoc();
    if (record.snapshot && record.snapshot.byteLength > 0) {
      applyUpdate(ydoc, record.snapshot);
    }
    const updates = await this.docs.listUpdates(spaceType, spaceId, docId);
    for (const update of updates) {
      applyUpdate(ydoc, update.payload);
    }
    return ydoc;
  }
}
