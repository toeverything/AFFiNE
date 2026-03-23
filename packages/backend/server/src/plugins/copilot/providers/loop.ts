import { z } from 'zod';

import type {
  NativeLlmRequest,
  NativeLlmStreamEvent,
  NativeLlmToolDefinition,
} from '../../../native';
import type {
  CopilotTool,
  CopilotToolExecuteOptions,
  CopilotToolSet,
} from '../tools';

export type NativeDispatchFn = (
  request: NativeLlmRequest,
  signal?: AbortSignal
) => AsyncIterableIterator<NativeLlmStreamEvent>;

export type NativeToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  rawArgumentsText?: string;
  argumentParseError?: string;
  thought?: string;
};

type ToolCallState = {
  name?: string;
  argumentsText: string;
};

type ToolExecutionResult = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  rawArgumentsText?: string;
  argumentParseError?: string;
  output: unknown;
  isError?: boolean;
};

type ParsedToolArguments = {
  args: Record<string, unknown>;
  rawArgumentsText?: string;
  argumentParseError?: string;
};

export class ToolCallAccumulator {
  readonly #states = new Map<string, ToolCallState>();

  feedDelta(event: Extract<NativeLlmStreamEvent, { type: 'tool_call_delta' }>) {
    const state = this.#states.get(event.call_id) ?? {
      argumentsText: '',
    };
    if (event.name) {
      state.name = event.name;
    }
    if (event.arguments_delta) {
      state.argumentsText += event.arguments_delta;
    }
    this.#states.set(event.call_id, state);
  }

  complete(event: Extract<NativeLlmStreamEvent, { type: 'tool_call' }>) {
    const state = this.#states.get(event.call_id);
    this.#states.delete(event.call_id);
    const parsed =
      event.arguments_text !== undefined || event.arguments_error !== undefined
        ? {
            args: event.arguments ?? {},
            rawArgumentsText: event.arguments_text ?? state?.argumentsText,
            argumentParseError: event.arguments_error,
          }
        : event.arguments
          ? this.parseArgs(event.arguments, state?.argumentsText)
          : this.parseJson(state?.argumentsText ?? '{}');
    return {
      id: event.call_id,
      name: event.name || state?.name || '',
      ...parsed,
      thought: event.thought,
    } satisfies NativeToolCall;
  }

  drainPending() {
    const pending: NativeToolCall[] = [];
    for (const [callId, state] of this.#states.entries()) {
      if (!state.name) {
        continue;
      }
      pending.push({
        id: callId,
        name: state.name,
        ...this.parseJson(state.argumentsText),
      });
    }
    this.#states.clear();
    return pending;
  }

  private parseJson(jsonText: string): ParsedToolArguments {
    if (!jsonText.trim()) {
      return { args: {} };
    }
    try {
      return this.parseArgs(JSON.parse(jsonText), jsonText);
    } catch (error) {
      return {
        args: {},
        rawArgumentsText: jsonText,
        argumentParseError:
          error instanceof Error
            ? error.message
            : 'Invalid tool arguments JSON',
      };
    }
  }

  private parseArgs(
    value: unknown,
    rawArgumentsText?: string
  ): ParsedToolArguments {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        args: value as Record<string, unknown>,
        rawArgumentsText,
      };
    }
    return {
      args: {},
      rawArgumentsText,
      argumentParseError: 'Tool arguments must be a JSON object',
    };
  }
}

export class ToolSchemaExtractor {
  static extract(toolSet: CopilotToolSet): NativeLlmToolDefinition[] {
    return Object.entries(toolSet).map(([name, tool]) => {
      return {
        name,
        description: tool.description,
        parameters: this.toJsonSchema(tool.inputSchema ?? z.object({})),
      };
    });
  }

  static toJsonSchema(schema: unknown): Record<string, unknown> {
    if (!(schema instanceof z.ZodType)) {
      if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
        return schema as Record<string, unknown>;
      }
      return { type: 'object', properties: {} };
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, child] of Object.entries(
        shape as Record<string, z.ZodTypeAny>
      )) {
        properties[key] = this.toJsonSchema(child);
        if (!this.isOptional(child)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        additionalProperties: false,
        ...(required.length ? { required } : {}),
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string' };
    }
    if (schema instanceof z.ZodNumber) {
      return { type: 'number' };
    }
    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }
    if (schema instanceof z.ZodArray) {
      return { type: 'array', items: this.toJsonSchema(schema.element) };
    }
    if (schema instanceof z.ZodEnum) {
      return { type: 'string', enum: schema.options };
    }
    if (schema instanceof z.ZodLiteral) {
      const literal = schema.value;
      if (literal === null) {
        return { const: null, type: 'null' };
      }
      if (typeof literal === 'string') {
        return { const: literal, type: 'string' };
      }
      if (typeof literal === 'number') {
        return { const: literal, type: 'number' };
      }
      if (typeof literal === 'boolean') {
        return { const: literal, type: 'boolean' };
      }
      return { const: literal };
    }
    if (schema instanceof z.ZodUnion) {
      return {
        anyOf: schema.options.map((option: z.ZodTypeAny) =>
          this.toJsonSchema(option)
        ),
      };
    }
    if (schema instanceof z.ZodRecord) {
      return {
        type: 'object',
        additionalProperties: this.toJsonSchema(schema.valueSchema),
      };
    }

    if (schema instanceof z.ZodNullable) {
      const inner = (schema._def as { innerType?: z.ZodTypeAny }).innerType;
      return { anyOf: [this.toJsonSchema(inner), { type: 'null' }] };
    }

    if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
      return this.toJsonSchema(
        (schema._def as { innerType?: z.ZodTypeAny }).innerType
      );
    }

    if (schema instanceof z.ZodEffects) {
      return this.toJsonSchema(
        (schema._def as { schema?: z.ZodTypeAny }).schema
      );
    }

    return { type: 'object', properties: {} };
  }

  private static isOptional(schema: z.ZodTypeAny): boolean {
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
      return true;
    }
    if (schema instanceof z.ZodNullable) {
      return this.isOptional(
        (schema._def as { innerType: z.ZodTypeAny }).innerType
      );
    }
    if (schema instanceof z.ZodEffects) {
      return this.isOptional((schema._def as { schema: z.ZodTypeAny }).schema);
    }
    return false;
  }
}

export class ToolCallLoop {
  constructor(
    private readonly dispatch: NativeDispatchFn,
    private readonly tools: CopilotToolSet,
    private readonly maxSteps = 20
  ) {}

  private normalizeToolExecuteOptions(
    signalOrOptions?: AbortSignal | CopilotToolExecuteOptions,
    maybeMessages?: CopilotToolExecuteOptions['messages']
  ): CopilotToolExecuteOptions {
    if (
      signalOrOptions &&
      typeof signalOrOptions === 'object' &&
      'aborted' in signalOrOptions
    ) {
      return {
        signal: signalOrOptions,
        messages: maybeMessages,
      };
    }

    if (!signalOrOptions) {
      return maybeMessages ? { messages: maybeMessages } : {};
    }

    return {
      ...signalOrOptions,
      signal: signalOrOptions.signal,
      messages: signalOrOptions.messages ?? maybeMessages,
    };
  }

  async *run(
    request: NativeLlmRequest,
    signalOrOptions?: AbortSignal | CopilotToolExecuteOptions,
    maybeMessages?: CopilotToolExecuteOptions['messages']
  ): AsyncIterableIterator<NativeLlmStreamEvent> {
    const toolExecuteOptions = this.normalizeToolExecuteOptions(
      signalOrOptions,
      maybeMessages
    );
    const messages = request.messages.map(message => ({
      ...message,
      content: [...message.content],
    }));

    for (let step = 0; step < this.maxSteps; step++) {
      const toolCalls: NativeToolCall[] = [];
      const accumulator = new ToolCallAccumulator();
      let finalDone: Extract<NativeLlmStreamEvent, { type: 'done' }> | null =
        null;

      for await (const event of this.dispatch(
        {
          ...request,
          stream: true,
          messages,
        },
        toolExecuteOptions.signal
      )) {
        switch (event.type) {
          case 'tool_call_delta': {
            accumulator.feedDelta(event);
            break;
          }
          case 'tool_call': {
            toolCalls.push(accumulator.complete(event));
            yield event;
            break;
          }
          case 'done': {
            finalDone = event;
            break;
          }
          case 'error': {
            throw new Error(event.message);
          }
          default: {
            yield event;
            break;
          }
        }
      }

      toolCalls.push(...accumulator.drainPending());
      if (toolCalls.length === 0) {
        if (finalDone) {
          yield finalDone;
        }
        break;
      }

      if (step === this.maxSteps - 1) {
        throw new Error('ToolCallLoop max steps reached');
      }

      const toolResults = await this.executeTools(
        toolCalls,
        toolExecuteOptions
      );

      messages.push({
        role: 'assistant',
        content: toolCalls.map(call => ({
          type: 'tool_call',
          call_id: call.id,
          name: call.name,
          arguments: call.args,
          arguments_text: call.rawArgumentsText,
          arguments_error: call.argumentParseError,
          thought: call.thought,
        })),
      });

      for (const result of toolResults) {
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              call_id: result.callId,
              name: result.name,
              arguments: result.args,
              arguments_text: result.rawArgumentsText,
              arguments_error: result.argumentParseError,
              output: result.output,
              is_error: result.isError,
            },
          ],
        });
        yield {
          type: 'tool_result',
          call_id: result.callId,
          name: result.name,
          arguments: result.args,
          arguments_text: result.rawArgumentsText,
          arguments_error: result.argumentParseError,
          output: result.output,
          is_error: result.isError,
        };
      }
    }
  }

  private async executeTools(
    calls: NativeToolCall[],
    options: CopilotToolExecuteOptions
  ) {
    return await Promise.all(
      calls.map(call => this.executeTool(call, options))
    );
  }

  private async executeTool(
    call: NativeToolCall,
    options: CopilotToolExecuteOptions
  ): Promise<ToolExecutionResult> {
    const tool = this.tools[call.name] as CopilotTool | undefined;

    if (!tool?.execute) {
      return {
        callId: call.id,
        name: call.name,
        args: call.args,
        rawArgumentsText: call.rawArgumentsText,
        argumentParseError: call.argumentParseError,
        isError: true,
        output: {
          message: `Tool not found: ${call.name}`,
        },
      };
    }

    if (call.argumentParseError) {
      return {
        callId: call.id,
        name: call.name,
        args: call.args,
        rawArgumentsText: call.rawArgumentsText,
        argumentParseError: call.argumentParseError,
        isError: true,
        output: {
          message: 'Invalid tool arguments JSON',
          rawArguments: call.rawArgumentsText,
          error: call.argumentParseError,
        },
      };
    }

    try {
      const output = await tool.execute(call.args, options);
      return {
        callId: call.id,
        name: call.name,
        args: call.args,
        rawArgumentsText: call.rawArgumentsText,
        argumentParseError: call.argumentParseError,
        output: output ?? null,
      };
    } catch (error) {
      console.error('Tool execution failed', {
        callId: call.id,
        toolName: call.name,
        error,
      });
      return {
        callId: call.id,
        name: call.name,
        args: call.args,
        rawArgumentsText: call.rawArgumentsText,
        argumentParseError: call.argumentParseError,
        isError: true,
        output: {
          message: 'Tool execution failed',
        },
      };
    }
  }
}
