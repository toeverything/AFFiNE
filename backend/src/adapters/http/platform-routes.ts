import { timingSafeEqual } from 'node:crypto';

import fp from 'fastify-plugin';
import { z } from 'zod';

import type { AiGatewayService } from '../../application/ai-gateway.js';
import type { AuditService } from '../../application/audit-service.js';
import type { AuthService } from '../../application/auth-service.js';
import type { JiraService } from '../../application/jira-service.js';
import type { WebhookService } from '../../application/webhook-service.js';
import type { WorkspaceService } from '../../application/workspace-service.js';
import { errors } from '../../domain/errors.js';

const CreateWebhook = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default([]),
  secret: z.string().optional(),
});

const Kanban = z.object({
  prompt: z.string().min(1),
});

const JiraImport = z.object({
  keys: z.array(z.string().min(1)).min(1),
});

const JiraPush = z.object({
  key: z.string().optional(),
  summary: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  assignee: z.string().optional(),
});

export const platformRoutes = fp<{
  auth: AuthService;
  workspaces: WorkspaceService;
  audit: AuditService;
  webhooks: WebhookService;
  ai: AiGatewayService;
  jira: JiraService;
  jiraWebhookSecret?: string;
}>(
  async (app, opts) => {
    const requireUser = async (request: {
      authSession: Parameters<AuthService['requireUser']>[0];
    }) => opts.auth.requireUser(request.authSession);

    app.get('/api/admin/audit-logs', async (request, reply) => {
      const user = await requireUser(request);
      opts.auth.requireInstanceAdmin(user);
      const query = request.query as {
        workspaceId?: string;
        action?: string;
        take?: string;
        format?: string;
      };
      const events = await opts.audit.list({
        ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.take ? { take: Number(query.take) } : {}),
      });
      if (query.format === 'csv') {
        void reply.header('content-type', 'text/csv; charset=utf-8');
        void reply.header(
          'content-disposition',
          'attachment; filename="audit-logs.csv"'
        );
        return opts.audit.toCsv(events);
      }
      return { items: events };
    });

    app.get('/api/workspaces/:id/webhooks', async request => {
      const user = await requireUser(request);
      const { id } = request.params as { id: string };
      return opts.webhooks.list(user, id);
    });

    app.post('/api/workspaces/:id/webhooks', async request => {
      const user = await requireUser(request);
      const { id } = request.params as { id: string };
      const body = CreateWebhook.parse(request.body);
      const input: { url: string; events: string[]; secret?: string } = {
        url: body.url,
        events: body.events,
      };
      if (body.secret) {
        input.secret = body.secret;
      }
      return opts.webhooks.create(user, id, input);
    });

    app.delete('/api/workspaces/:id/webhooks/:hookId', async request => {
      const user = await requireUser(request);
      const { id, hookId } = request.params as { id: string; hookId: string };
      return { ok: await opts.webhooks.remove(user, id, hookId) };
    });

    app.post('/api/workspaces/:id/ai/kanban', async request => {
      const user = await requireUser(request);
      const { id } = request.params as { id: string };
      await opts.workspaces.requireMember(user, id);
      const body = Kanban.parse(request.body);
      return opts.ai.kanban(body.prompt);
    });

    app.get('/api/workspaces/:id/jira/search', async request => {
      const user = await requireUser(request);
      const { id } = request.params as { id: string };
      await opts.workspaces.requireMember(user, id);
      const query = (request.query as { q?: string }).q ?? '';
      return { items: await opts.jira.search(query) };
    });

    app.post('/api/workspaces/:id/jira/import', async request => {
      const user = await requireUser(request);
      const { id } = request.params as { id: string };
      await opts.workspaces.requireMember(user, id);
      const body = JiraImport.parse(request.body);
      return { items: await opts.jira.import(body.keys) };
    });

    app.post('/api/workspaces/:id/jira/push', async request => {
      const user = await requireUser(request);
      const { id } = request.params as { id: string };
      await opts.workspaces.requireAdmin(user, id);
      const body = JiraPush.parse(request.body);
      const draft: {
        summary: string;
        key?: string;
        description?: string;
        status?: string;
        assignee?: string;
      } = { summary: body.summary };
      if (body.key) draft.key = body.key;
      if (body.description) draft.description = body.description;
      if (body.status) draft.status = body.status;
      if (body.assignee) draft.assignee = body.assignee;
      const preview = await opts.jira.push(draft);
      await opts.audit.record({
        workspaceId: id,
        actorId: user.id,
        action: 'jira.push',
        targetType: 'jira',
        targetId: preview.key,
      });
      await opts.webhooks.emit(id, 'jira.synced', {
        key: preview.key,
        summary: preview.summary,
      });
      return preview;
    });

    app.get('/api/workspaces/:id/jira/pull', async request => {
      const user = await requireUser(request);
      const { id } = request.params as { id: string };
      await opts.workspaces.requireMember(user, id);
      return { items: await opts.jira.pull(new Date()) };
    });

    app.post('/api/webhooks/jira', async request => {
      if (!opts.jiraWebhookSecret) {
        throw errors.jiraNotConfigured();
      }
      const header =
        (request.headers['x-mosaic-jira-secret'] as string | undefined) ??
        (request.headers['x-hub-signature'] as string | undefined);
      if (!header || !timingSafeEqualStrings(header, opts.jiraWebhookSecret)) {
        throw errors.accessDenied();
      }
      const body = (request.body ?? {}) as { workspaceId?: string };
      if (body.workspaceId) {
        await opts.webhooks.emit(body.workspaceId, 'jira.synced', {
          inbound: true,
        });
      }
      return { ok: true };
    });
  },
  { name: 'mosaic-platform-routes' }
);

function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
