import type {
  CopilotProviderExecution,
  PreparedNativeExecution,
  PreparedNativeRequestOptions,
  ProviderChatDriver,
  ProviderChatDriverPrepareInput,
} from '../providers/provider-runtime-contract';
import type {
  CopilotChatOptions,
  CopilotProviderModel,
  CopilotProviderType,
  ModelConditions,
  ModelFullConditions,
  PromptMessage,
  StreamObject,
} from '../providers/types';
import { ModelOutputType } from '../providers/types';
import {
  resolveDriverOrThrow,
  resolvePreparedModelId,
  runPreparedExecution,
} from './provider-driver-runtime';
import type { NativeProviderAdapter } from './tool/native-adapter';

type MetricLabels = Record<string, string | number | boolean | undefined>;

export type ChatRuntimeContext = {
  type: CopilotProviderType;
  resolveChatDriver: () => ProviderChatDriver | undefined;
  selectModel: (cond: ModelFullConditions) => CopilotProviderModel;
  metricLabels: (
    model: string,
    labels?: MetricLabels,
    execution?: CopilotProviderExecution
  ) => MetricLabels;
  createPreparedExecutionAdapter: (
    prepared: PreparedNativeExecution
  ) => NativeProviderAdapter;
};

type ChatExecutionMode = {
  kind: ProviderChatDriverPrepareInput['kind'];
  outputType: ModelOutputType;
  unsupportedKind: 'text' | 'object';
  callMetric: string;
  errorMetric: string;
};

export async function prepareNativeChatExecution(
  resolveChatDriver: () => ProviderChatDriver | undefined,
  buildPreparedNativeExecution: (
    options: PreparedNativeRequestOptions
  ) => Promise<PreparedNativeExecution>,
  input: ProviderChatDriverPrepareInput
): Promise<PreparedNativeExecution | null> {
  const driver = resolveChatDriver();
  if (!driver) {
    return null;
  }

  const prepared = await driver.prepare(input);
  if (!prepared) {
    return null;
  }

  return await buildPreparedNativeExecution({
    ...prepared,
    execution: input.execution,
    options: input.options,
  });
}

async function runNativeChat(
  context: ChatRuntimeContext,
  prepareNativeExecution: (
    kind: ProviderChatDriverPrepareInput['kind'],
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    execution?: CopilotProviderExecution
  ) => Promise<PreparedNativeExecution | null>,
  mode: ChatExecutionMode,
  model: ModelConditions,
  messages: PromptMessage[],
  options: CopilotChatOptions | undefined,
  execution: CopilotProviderExecution | undefined,
  run: (
    adapter: NativeProviderAdapter,
    prepared: PreparedNativeExecution,
    signal: AbortSignal | undefined,
    promptMessages: PromptMessage[]
  ) =>
    | Promise<string>
    | AsyncIterableIterator<string>
    | AsyncIterableIterator<StreamObject>
) {
  const driver = resolveDriverOrThrow(
    context.type,
    mode.unsupportedKind,
    context.resolveChatDriver
  );
  const chatOptions = options ?? {};
  const prepared = await prepareNativeExecution(
    mode.kind,
    model,
    messages,
    chatOptions,
    execution
  );
  const modelId = resolvePreparedModelId(
    context,
    model,
    mode.outputType,
    prepared
  );

  return await runPreparedExecution({
    driver,
    prepared,
    modelId,
    execution,
    metricContext: context,
    metricsName: {
      call: mode.callMetric,
      error: mode.errorMetric,
    },
    execute: async preparedExecution =>
      await run(
        context.createPreparedExecutionAdapter(preparedExecution),
        preparedExecution,
        chatOptions.signal,
        messages
      ),
  });
}

export async function runNativeText(
  context: ChatRuntimeContext,
  prepareNativeExecution: (
    kind: ProviderChatDriverPrepareInput['kind'],
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    execution?: CopilotProviderExecution
  ) => Promise<PreparedNativeExecution | null>,
  model: ModelConditions,
  messages: PromptMessage[],
  options?: CopilotChatOptions,
  execution?: CopilotProviderExecution
) {
  return (await runNativeChat(
    context,
    prepareNativeExecution,
    {
      kind: 'text',
      outputType: ModelOutputType.Text,
      unsupportedKind: 'text',
      callMetric: 'chat_text_calls',
      errorMetric: 'chat_text_errors',
    },
    model,
    messages,
    options,
    execution,
    (adapter, prepared, signal, promptMessages) =>
      adapter.text(prepared.request, signal, promptMessages)
  )) as string;
}

export async function* runNativeStreamText(
  context: ChatRuntimeContext,
  prepareNativeExecution: (
    kind: ProviderChatDriverPrepareInput['kind'],
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    execution?: CopilotProviderExecution
  ) => Promise<PreparedNativeExecution | null>,
  model: ModelConditions,
  messages: PromptMessage[],
  options?: CopilotChatOptions,
  execution?: CopilotProviderExecution
): AsyncIterableIterator<string> {
  yield* (await runNativeChat(
    context,
    prepareNativeExecution,
    {
      kind: 'streamText',
      outputType: ModelOutputType.Text,
      unsupportedKind: 'text',
      callMetric: 'chat_text_stream_calls',
      errorMetric: 'chat_text_stream_errors',
    },
    model,
    messages,
    options,
    execution,
    (adapter, prepared, signal, promptMessages) =>
      adapter.streamText(prepared.request, signal, promptMessages)
  )) as AsyncIterableIterator<string>;
}

export async function* runNativeStreamObject(
  context: ChatRuntimeContext,
  prepareNativeExecution: (
    kind: ProviderChatDriverPrepareInput['kind'],
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    execution?: CopilotProviderExecution
  ) => Promise<PreparedNativeExecution | null>,
  model: ModelConditions,
  messages: PromptMessage[],
  options?: CopilotChatOptions,
  execution?: CopilotProviderExecution
): AsyncIterableIterator<StreamObject> {
  yield* (await runNativeChat(
    context,
    prepareNativeExecution,
    {
      kind: 'streamObject',
      outputType: ModelOutputType.Object,
      unsupportedKind: 'object',
      callMetric: 'chat_object_stream_calls',
      errorMetric: 'chat_object_stream_errors',
    },
    model,
    messages,
    options,
    execution,
    (adapter, prepared, signal, promptMessages) =>
      adapter.streamObject(prepared.request, signal, promptMessages)
  )) as AsyncIterableIterator<StreamObject>;
}
