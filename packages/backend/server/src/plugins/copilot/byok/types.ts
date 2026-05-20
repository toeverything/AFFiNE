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

export type ByokFeatureKind =
  | 'chat'
  | 'action'
  | 'image'
  | 'embedding'
  | 'rerank'
  | 'transcript'
  | 'workspace_indexing';

export const BYOK_ALLOWED_PROVIDERS = [
  ByokProvider.openai,
  ByokProvider.anthropic,
  ByokProvider.gemini,
  ByokProvider.fal,
] as const;

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
  return (BYOK_ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

registerEnumType(ByokProvider, { name: 'ByokProvider' });
registerEnumType(ByokKeyStorage, { name: 'ByokKeyStorage' });
registerEnumType(ByokKeyTestStatus, { name: 'ByokKeyTestStatus' });
