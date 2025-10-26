export interface ToolError {
  type: 'error';
  name: string;
  message: string;
}

export const toolError = (name: string, message: string): ToolError => ({
  type: 'error',
  name,
  message,
});
