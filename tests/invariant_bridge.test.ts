import { executeToolCall } from './bridge';
import type { CopilotToolSet, LlmToolCallbackRequest, CopilotToolExecuteOptions } from './bridge';

describe('executeToolCall maintains security boundary under adversarial input', () => {
  const mockTool = {
    execute: jest.fn().mockResolvedValue({ message: 'executed' }),
  };

  const mockTools: CopilotToolSet = {
    safeTool: mockTool,
  };

  const baseOptions: CopilotToolExecuteOptions = {
    context: {},
  };

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

  test.each(payloads)('handles $description without corrupting execution context', async ({ request }) => {
    const originalObjectProto = Object.prototype;
    
    const response = await executeToolCall(mockTools, request, baseOptions);
    
    expect(response).toBeDefined();
    expect(Object.prototype).toBe(originalObjectProto);
    expect((Object.prototype as any).polluted).toBeUndefined();
    
    if (request.name in mockTools) {
      expect(mockTool.execute).toHaveBeenCalledWith(request.args, baseOptions);
    }
  });
});