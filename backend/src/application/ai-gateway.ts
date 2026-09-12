import { errors } from '../domain/errors.js';
import type {
  CopilotMessageRecord,
  CopilotSessionRecord,
} from '../domain/ai.js';
import type { AiStore, Clock, HttpFetcher } from '../domain/ports.js';
import type { AuditService } from './audit-service.js';
import type { User } from '../domain/identity.js';

export interface AiSettings {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export class AiGatewayService {
  constructor(
    private readonly store: AiStore,
    private readonly clock: Clock,
    private readonly settings: AiSettings,
    private readonly fetch: HttpFetcher = globalThis.fetch,
    private readonly audit?: AuditService
  ) {}

  get enabled(): boolean {
    return Boolean(this.settings.apiKey);
  }

  async quota(user: User): Promise<{ limit: number | null; used: number }> {
    const used = await this.store.countCopilotSessions(user.id);
    if (!this.enabled) {
      return { limit: 0, used };
    }
    return { limit: null, used };
  }

  async createSession(
    user: User,
    input: {
      workspaceId: string;
      docId?: string | null;
      promptName: string;
      pinned?: boolean;
      reuseLatestChat?: boolean | null;
    }
  ): Promise<CopilotSessionRecord> {
    this.assertEnabled();
    if (input.reuseLatestChat !== false) {
      const existing = await this.store.listCopilotSessions(
        user.id,
        input.workspaceId
      );
      const match = existing.find(
        session =>
          session.promptName === input.promptName &&
          (input.docId ? session.docId === input.docId : true)
      );
      if (match) {
        return match;
      }
    }
    const now = this.clock.now();
    const session = await this.store.createCopilotSession({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      userId: user.id,
      docId: input.docId ?? null,
      promptName: input.promptName,
      title: null,
      pinned: input.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    });
    await this.audit?.record({
      workspaceId: input.workspaceId,
      actorId: user.id,
      action: 'ai.session_create',
      targetType: 'copilot_session',
      targetId: session.id,
    });
    return session;
  }

  async history(sessionId: string): Promise<{
    session: CopilotSessionRecord;
    messages: CopilotMessageRecord[];
  }> {
    const session = await this.store.getCopilotSession(sessionId);
    if (!session) {
      throw errors.badRequest('Copilot session not found.');
    }
    return {
      session,
      messages: await this.store.listCopilotMessages(sessionId),
    };
  }

  async chat(
    user: User,
    sessionId: string,
    content: string
  ): Promise<CopilotMessageRecord> {
    this.assertEnabled();
    const session = await this.store.getCopilotSession(sessionId);
    if (!session || session.userId !== user.id) {
      throw errors.badRequest('Copilot session not found.');
    }
    const now = this.clock.now();
    await this.store.appendCopilotMessage({
      id: crypto.randomUUID(),
      sessionId,
      role: 'user',
      content,
      createdAt: now,
    });
    const reply = await this.complete([
      {
        role: 'system',
        content: `Mosaic BYOK assistant. Prompt: ${session.promptName}`,
      },
      { role: 'user', content },
    ]);
    return this.store.appendCopilotMessage({
      id: crypto.randomUUID(),
      sessionId,
      role: 'assistant',
      content: reply,
      createdAt: this.clock.now(),
    });
  }

  async kanban(prompt: string): Promise<{
    columns: Array<{ name: string }>;
    rows: Array<Record<string, string>>;
  }> {
    this.assertEnabled();
    const raw = await this.complete([
      {
        role: 'system',
        content:
          'Return JSON only: {"columns":[{"name":"To do"},{"name":"In progress"},{"name":"Done"}],"rows":[{"title":"...","status":"To do"}]}. Max 50 rows.',
      },
      { role: 'user', content: prompt },
    ]);
    try {
      const parsed = JSON.parse(raw) as {
        columns?: Array<{ name: string }>;
        rows?: Array<Record<string, string>>;
      };
      return {
        columns: parsed.columns ?? [
          { name: 'To do' },
          { name: 'In progress' },
          { name: 'Done' },
        ],
        rows: (parsed.rows ?? []).slice(0, 50),
      };
    } catch {
      return {
        columns: [{ name: 'To do' }, { name: 'In progress' }, { name: 'Done' }],
        rows: [{ title: prompt.slice(0, 80), status: 'To do' }],
      };
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw errors.copilotDisabled();
    }
  }

  private async complete(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const url = `${this.settings.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.settings.apiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      throw errors.actionForbidden('AI provider rejected the request.');
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? '';
  }
}
