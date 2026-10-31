export interface PendingCommand {
  id: string;
  code: string;
  createdAt: number;
  consumedAt: number | null;
}

export interface EvalResult {
  id: string;
  ok: boolean;
  result?: string;
  error?: string;
  receivedAt: number;
}
