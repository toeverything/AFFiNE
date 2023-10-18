import type { z } from 'zod';

export type Action<
  InputSchema extends z.ZodObject<any, any, any, any>,
  Args extends readonly any[],
> = {
  id: string;
  name: string;
  description: string;
  inputSchema: InputSchema;
  action: (input: z.input<InputSchema>, ...args: Args) => void;
};
