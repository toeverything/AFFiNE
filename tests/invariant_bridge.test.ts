import { z } from 'zod';

import { executeToolCall } from './bridge';
import type {
  CopilotToolSet,
  LlmToolCallbackRequest,
  CopilotToolExecuteOptions,
} from './bridge';

describe('executeToolCall maintains security boundary under adversarial input', () => {
  // Give mockTool a real Zod inputSchema so the Zod-parse path is actually exercised.
  // z.record(z.unknown()) accepts any plain key-value record.
  const inputSchema = z.record(z.unknown());

  const mockTool = {
    inputSchema,
    execute: jest.fn().mockResolvedValue({ message: 'executed' }),
  };

  const mockTools: CopilotToolSet = {
    safeTool: mockTool,
  };

  // CopilotToolExecuteOptions only supports { signal?, messages? } — no `context`
  const baseOptions: CopilotToolExecuteOptions = {};

  beforeEach(() => {
    mockTool.execute.mockClear();
  });

  const payloads: Array<{ description: string; request: LlmToolCallbackRequest }> = [
    {
      description: 'prototype pollution payload',
      request: {
        callId: '1',
        name: 'safeTool',
        args: JSON.parse('{"__proto__":{"polluted":"yes"}}'),
        rawArgumentsText: '{"__proto__":{"polluted":"yes"}}',
        argumentParseError: null,
      },
    },
    {
      description: 'excessive nested object',
      request: {
        callId: '2',
        name: 'safeTool',
        args: { a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } } },
        rawArgumentsText: '{"a":{"b":{"c":{"d":{"e":{"f":{"g":"deep"}}}}}}}',
        argumentParseError: null,
      },
    },
    {
      description: 'valid minimal input',
      request: {
        callId: '3',
        name: 'safeTool',
        args: {},
        rawArgumentsText: '{}',
        argumentParseError: null,
      },
    },
  ];

  test.each(payloads)(
    'handles $description without corrupting execution context',
    async ({ request }) => {
      const originalObjectProto = Object.prototype;

      const response = await executeToolCall(mockTools, request, baseOptions);

      expect(response).toBeDefined();
      expect(Object.prototype).toBe(originalObjectProto);
      expect((Object.prototype as any).polluted).toBeUndefined();

      // Capture the actual arguments passed to mockTool.execute
      const [[actualArgs, actualOptions]] = mockTool.execute.mock.calls;

      // Identity assertion: args must NOT be the same reference as request.args
      // This catches regressions where executeToolCall forwards request.args directly
      expect(actualArgs).not.toBe(request.args);

      // Correctness assertion: args should deeply equal the parsed result
      const parsedArgs = inputSchema.parse(request.args);
      expect(actualArgs).toEqual(parsedArgs);

      // Identity assertion: options should be the same reference
      expect(actualOptions).toBe(baseOptions);
    }
  );

  test('rejects tool calls whose args fail schema validation', async () => {
    const strictTool = {
      inputSchema: z.object({ name: z.string() }),
      execute: jest.fn().mockResolvedValue({ message: 'executed' }),
    };
    const strictTools: CopilotToolSet = { strictTool };

    const request: LlmToolCallbackRequest = {
      callId: '4',
      name: 'strictTool',
      // invalid: `name` must be a string, not a number
      args: { name: 123 },
      rawArgumentsText: '{"name":123}',
      argumentParseError: null,
    };

    const response = await executeToolCall(strictTools, request, baseOptions);
    expect(response.isError).toBe(true);
    expect(strictTool.execute).not.toHaveBeenCalled();
  });
});
