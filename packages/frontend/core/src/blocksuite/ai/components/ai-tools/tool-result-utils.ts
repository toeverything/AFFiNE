import type { ToolError } from './type';

export const isToolError = (result: unknown): result is ToolError =>
  !!result &&
  typeof result === 'object' &&
  'type' in result &&
  (result as ToolError).type === 'error';

export const getToolErrorDisplayName = (
  result: ToolError | null,
  fallback: string,
  overrides: Record<string, string> = {}
) => {
  if (!result) return fallback;
  return overrides[result.name] ?? result.name;
};
