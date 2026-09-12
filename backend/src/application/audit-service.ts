import type { AuditEvent, AuditQuery } from '../domain/audit.js';
import type { AuditStore, Clock, HttpFetcher } from '../domain/ports.js';

export interface AuditRecordInput {
  workspaceId?: string | null;
  actorId?: string | null;
  actorType?: AuditEvent['actorType'];
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export class AuditService {
  constructor(
    private readonly store: AuditStore,
    private readonly clock: Clock,
    private readonly fetch: HttpFetcher = globalThis.fetch,
    private readonly siemUrl?: string,
    private readonly retentionDays = 365
  ) {}

  async record(input: AuditRecordInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId ?? null,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? (input.actorId ? 'user' : 'system'),
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: this.clock.now(),
    };
    const saved = await this.store.appendAudit(event);
    if (this.siemUrl) {
      void this.forward(saved);
    }
    return saved;
  }

  async list(query: AuditQuery): Promise<AuditEvent[]> {
    const after =
      this.retentionDays > 0
        ? new Date(
            this.clock.now().getTime() -
              this.retentionDays * 24 * 60 * 60 * 1000
          )
        : query.after;
    const merged: AuditQuery = {
      ...query,
      take: Math.min(500, Math.max(1, query.take ?? 100)),
    };
    if (query.after && after) {
      merged.after =
        query.after.getTime() > after.getTime() ? query.after : after;
    } else if (after) {
      merged.after = after;
    }
    return this.store.listAudit(merged);
  }

  toCsv(events: AuditEvent[]): string {
    const header =
      'createdAt,action,actorId,workspaceId,targetType,targetId,ip';
    const rows = events.map(event =>
      [
        event.createdAt.toISOString(),
        event.action,
        event.actorId ?? '',
        event.workspaceId ?? '',
        event.targetType ?? '',
        event.targetId ?? '',
        event.ip ?? '',
      ]
        .map(value => `"${value.replaceAll('"', '""')}"`)
        .join(',')
    );
    return [header, ...rows].join('\n');
  }

  private async forward(event: AuditEvent): Promise<void> {
    if (!this.siemUrl) {
      return;
    }
    try {
      await this.fetch(this.siemUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch {
      // SIEM fan-out must not fail the originating mutation.
    }
  }
}
