import { timingSafeEqual } from 'node:crypto';

import type { AuditService } from './audit-service.js';
import { hmacSha256 } from './oidc-client.js';
import type { WorkspaceWebhook, WebhookDelivery } from '../domain/webhook.js';
import { errors } from '../domain/errors.js';
import type { Clock, HttpFetcher, WebhookStore } from '../domain/ports.js';
import type { User } from '../domain/identity.js';
import type { WorkspaceService } from './workspace-service.js';

export class WebhookService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly store: WebhookStore,
    private readonly clock: Clock,
    private readonly fetch: HttpFetcher = globalThis.fetch,
    private readonly audit?: AuditService
  ) {}

  async create(
    user: User,
    workspaceId: string,
    input: { url: string; events: string[]; secret?: string }
  ): Promise<WorkspaceWebhook> {
    await this.workspaces.requireAdmin(user, workspaceId);
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw errors.badRequest('Webhook URL is invalid.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw errors.badRequest('Webhook URL must be http(s).');
    }
    const hook = await this.store.createWebhook({
      id: crypto.randomUUID(),
      workspaceId,
      url: input.url,
      secret: input.secret?.trim() || crypto.randomUUID(),
      events: input.events.length > 0 ? input.events : ['member.invited'],
      active: true,
      createdAt: this.clock.now(),
    });
    await this.audit?.record({
      workspaceId,
      actorId: user.id,
      action: 'webhook.create',
      targetType: 'webhook',
      targetId: hook.id,
    });
    return hook;
  }

  /**
   * Returns webhooks with their HMAC `secret` redacted. Any workspace
   * member can list webhook endpoints/events, but only the response from
   * `create()` (admin-only) ever carries the real secret: leaking it to
   * every collaborator would let them forge `X-Mosaic-Signature` deliveries
   * or impersonate the configured receiver.
   */
  async list(
    user: User,
    workspaceId: string
  ): Promise<Array<Omit<WorkspaceWebhook, 'secret'>>> {
    await this.workspaces.requireMember(user, workspaceId);
    const hooks = await this.store.listWebhooks(workspaceId);
    return hooks.map(({ secret: _secret, ...rest }) => rest);
  }

  async remove(user: User, workspaceId: string, id: string): Promise<boolean> {
    await this.workspaces.requireAdmin(user, workspaceId);
    const hook = await this.store.getWebhook(id);
    if (!hook || hook.workspaceId !== workspaceId) {
      throw errors.webhookNotFound();
    }
    const removed = await this.store.deleteWebhook(id);
    if (removed) {
      await this.audit?.record({
        workspaceId,
        actorId: user.id,
        action: 'webhook.delete',
        targetType: 'webhook',
        targetId: id,
      });
    }
    return removed;
  }

  async emit(
    workspaceId: string,
    event: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const hooks = (await this.store.listWebhooks(workspaceId)).filter(
      hook => hook.active && hook.events.includes(event)
    );
    if (hooks.length === 0) {
      return;
    }
    const delivery: WebhookDelivery = {
      event,
      workspaceId,
      occurredAt: this.clock.now().toISOString(),
      payload,
    };
    const body = JSON.stringify(delivery);
    await Promise.all(
      hooks.map(async hook => {
        const signature = hmacSha256(hook.secret, body);
        try {
          await this.fetch(hook.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-mosaic-signature': `sha256=${signature}`,
              'x-mosaic-event': event,
            },
            body,
          });
        } catch {
          // Delivery failures are best-effort.
        }
      })
    );
    await this.audit?.record({
      workspaceId,
      action: 'webhook.deliver',
      targetType: 'webhook',
      metadata: { event, hooks: hooks.length },
    });
  }

  verifySignature(
    secret: string,
    body: string,
    header: string | undefined
  ): boolean {
    if (!header) {
      return false;
    }
    const expected = `sha256=${hmacSha256(secret, body)}`;
    const left = Buffer.from(header);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
