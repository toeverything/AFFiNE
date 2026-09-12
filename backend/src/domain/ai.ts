export interface CopilotSessionRecord {
  id: string;
  workspaceId: string;
  userId: string;
  docId: string | null;
  promptName: string;
  title: string | null;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CopilotMessageRecord {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
}

export interface ChatCompletionResult {
  content: string;
}
