export interface ToolError {
  type: 'error';
  name: string;
  message: string;
  code?: string;
  retryable?: boolean;
  locator?: Record<string, string>;
}

export const toolError = (
  name: string,
  message: string,
  details: Pick<ToolError, 'code' | 'retryable' | 'locator'> = {}
): ToolError => ({ type: 'error', name, message, ...details });
