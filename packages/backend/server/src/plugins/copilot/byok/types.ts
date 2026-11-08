import { registerEnumType } from '@nestjs/graphql';

import { CopilotProviderType } from '../providers/types';

export enum ByokProvider {
  openai = 'openai',
  anthropic = 'anthropic',
  gemini = 'gemini',
  fal = 'fal',
}

export enum ByokKeyStorage {
  server = 'server',
  local = 'local',
}

export enum ByokKeyTestStatus {
  untested = 'untested',
  passed = 'passed',
  failed = 'failed',
}

export enum ByokProviderSource {
  Server = 'byok_server',
  Local = 'byok_local',
  AffinePlan = 'affine_plan',
}

export enum ByokEndpointKind {
  provider_default = 'provider_default',
  openai_compatible = 'openai_compatible',
}

export enum ByokOpenAiDialect {
  responses = 'responses',
  chat_completions = 'chat_completions',
}

export enum ByokModelInput {
  text = 'text',
  image = 'image',
  audio = 'audio',
  file = 'file',
}

export enum ByokModelOutput {
  text = 'text',
  object = 'object',
  structured = 'structured',
  embedding = 'embedding',
  rerank = 'rerank',
  image = 'image',
}

export enum ByokModelFeature {
  tool_calling = 'tool_calling',
  reasoning = 'reasoning',
  web_search = 'web_search',
}

export enum ByokAttachmentKind {
  image = 'image',
  audio = 'audio',
  file = 'file',
}

export enum ByokAttachmentSource {
  url = 'url',
  data = 'data',
  bytes = 'bytes',
  file_handle = 'file_handle',
}

export enum ByokProbeOperation {
  chat = 'chat',
  structured = 'structured',
  tool_calling = 'tool_calling',
  vision = 'vision',
  embedding = 'embedding',
  rerank = 'rerank',
  image = 'image',
  transcript = 'transcript',
}

export enum ByokProbeStatusKind {
  verified = 'verified',
  failed = 'failed',
  not_tested = 'not_tested',
}

export enum ByokCustomEndpointMode {
  unavailable = 'unavailable',
  disabled = 'disabled',
  enabled = 'enabled',
}

export type ByokFeatureKind =
  | 'chat'
  | 'action'
  | 'image'
  | 'embedding'
  | 'rerank'
  | 'transcript'
  | 'workspace_indexing';

export function byokProviderToCopilotType(provider: ByokProvider) {
  switch (provider) {
    case ByokProvider.openai:
      return CopilotProviderType.OpenAI;
    case ByokProvider.anthropic:
      return CopilotProviderType.Anthropic;
    case ByokProvider.gemini:
      return CopilotProviderType.Gemini;
    case ByokProvider.fal:
      return CopilotProviderType.FAL;
  }
}

export function copilotTypeToByokProvider(type: CopilotProviderType) {
  switch (type) {
    case CopilotProviderType.OpenAI:
      return ByokProvider.openai;
    case CopilotProviderType.Anthropic:
      return ByokProvider.anthropic;
    case CopilotProviderType.Gemini:
      return ByokProvider.gemini;
    case CopilotProviderType.FAL:
      return ByokProvider.fal;
    default:
      return null;
  }
}

export function isByokProvider(value: string): value is ByokProvider {
  switch (value) {
    case ByokProvider.openai:
    case ByokProvider.anthropic:
    case ByokProvider.gemini:
    case ByokProvider.fal:
      return true;
    default:
      return false;
  }
}

registerEnumType(ByokProvider, { name: 'ByokProvider' });
registerEnumType(ByokKeyStorage, { name: 'ByokKeyStorage' });
registerEnumType(ByokKeyTestStatus, { name: 'ByokKeyTestStatus' });
registerEnumType(ByokEndpointKind, { name: 'ByokEndpointKind' });
registerEnumType(ByokOpenAiDialect, { name: 'ByokOpenAiDialect' });
registerEnumType(ByokModelInput, { name: 'ByokModelInput' });
registerEnumType(ByokModelOutput, { name: 'ByokModelOutput' });
registerEnumType(ByokModelFeature, { name: 'ByokModelFeature' });
registerEnumType(ByokAttachmentKind, { name: 'ByokAttachmentKind' });
registerEnumType(ByokAttachmentSource, { name: 'ByokAttachmentSource' });
registerEnumType(ByokProbeOperation, { name: 'ByokProbeOperation' });
registerEnumType(ByokProbeStatusKind, { name: 'ByokProbeStatusKind' });
registerEnumType(ByokCustomEndpointMode, {
  name: 'ByokCustomEndpointMode',
});
