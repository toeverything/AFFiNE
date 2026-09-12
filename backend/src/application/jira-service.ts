import { errors } from '../domain/errors.js';
import type {
  IssueSource,
  JiraIssueDraft,
  JiraIssuePreview,
} from '../domain/jira.js';
import type { HttpFetcher } from '../domain/ports.js';

export interface JiraSettings {
  baseUrl?: string;
  email?: string;
  apiToken?: string;
}

export class JiraService implements IssueSource {
  constructor(
    private readonly settings: JiraSettings,
    private readonly fetch: HttpFetcher = globalThis.fetch
  ) {}

  get configured(): boolean {
    return Boolean(
      this.settings.baseUrl && this.settings.email && this.settings.apiToken
    );
  }

  async search(query: string): Promise<JiraIssuePreview[]> {
    this.assertConfigured();
    const url = `${this.root()}/rest/api/3/search/jql?jql=${encodeURIComponent(query)}&maxResults=20`;
    const json = await this.request(url);
    const issues = Array.isArray((json as { issues?: unknown }).issues)
      ? (json as { issues: Array<Record<string, unknown>> }).issues
      : [];
    return issues.map(mapIssue);
  }

  async import(keys: string[]): Promise<JiraIssueDraft[]> {
    this.assertConfigured();
    const drafts: JiraIssueDraft[] = [];
    for (const key of keys) {
      const json = await this.request(
        `${this.root()}/rest/api/3/issue/${encodeURIComponent(key)}`
      );
      drafts.push(mapDraft(json as Record<string, unknown>));
    }
    return drafts;
  }

  async push(fields: JiraIssueDraft): Promise<JiraIssuePreview> {
    this.assertConfigured();
    if (fields.key) {
      await this.request(
        `${this.root()}/rest/api/3/issue/${encodeURIComponent(fields.key)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            fields: {
              summary: fields.summary,
              description: fields.description ?? '',
            },
          }),
        }
      );
      return {
        key: fields.key,
        summary: fields.summary,
        status: fields.status ?? 'To Do',
        assignee: fields.assignee ?? null,
      };
    }
    const json = await this.request(`${this.root()}/rest/api/3/issue`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          summary: fields.summary,
          description: fields.description ?? '',
          issuetype: { name: 'Task' },
        },
      }),
    });
    const key = String((json as { key?: string }).key ?? '');
    return {
      key,
      summary: fields.summary,
      status: fields.status ?? 'To Do',
      assignee: fields.assignee ?? null,
    };
  }

  async pull(_since: Date): Promise<JiraIssueDraft[]> {
    this.assertConfigured();
    const issues = await this.search('updated >= -1d ORDER BY updated DESC');
    return issues.map(issue => {
      const draft: JiraIssueDraft = {
        key: issue.key,
        summary: issue.summary,
        status: issue.status,
      };
      if (issue.assignee) {
        draft.assignee = issue.assignee;
      }
      return draft;
    });
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw errors.jiraNotConfigured();
    }
  }

  private root(): string {
    return (this.settings.baseUrl ?? '').replace(/\/$/, '');
  }

  private async request(url: string, init: RequestInit = {}): Promise<unknown> {
    const token = Buffer.from(
      `${this.settings.email}:${this.settings.apiToken}`,
      'utf8'
    ).toString('base64');
    const res = await this.fetch(url, {
      ...init,
      headers: {
        authorization: `Basic ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw errors.actionForbidden('Jira request failed.');
    }
    if (res.status === 204) {
      return {};
    }
    return res.json();
  }
}

function mapIssue(raw: Record<string, unknown>): JiraIssuePreview {
  const fields = (raw.fields ?? {}) as Record<string, unknown>;
  const status = (fields.status ?? {}) as Record<string, unknown>;
  const assignee = (fields.assignee ?? null) as Record<string, unknown> | null;
  return {
    key: String(raw.key ?? ''),
    summary: String(fields.summary ?? ''),
    status: String(status.name ?? ''),
    assignee: assignee ? String(assignee.displayName ?? '') : null,
  };
}

function mapDraft(raw: Record<string, unknown>): JiraIssueDraft {
  const preview = mapIssue(raw);
  const fields = (raw.fields ?? {}) as Record<string, unknown>;
  return {
    key: preview.key,
    summary: preview.summary,
    description:
      typeof fields.description === 'string' ? fields.description : '',
    status: preview.status,
    ...(preview.assignee ? { assignee: preview.assignee } : {}),
  };
}
