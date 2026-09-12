export interface JiraIssuePreview {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
}

export interface JiraIssueDraft {
  key?: string;
  summary: string;
  description?: string;
  status?: string;
  assignee?: string;
  estimation?: string;
}

export interface IssueSource {
  configured: boolean;
  search(query: string): Promise<JiraIssuePreview[]>;
  import(keys: string[]): Promise<JiraIssueDraft[]>;
  push(fields: JiraIssueDraft): Promise<JiraIssuePreview>;
  pull(since: Date): Promise<JiraIssueDraft[]>;
}
