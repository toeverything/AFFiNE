import type {
  PromptConfig,
  PromptMessage,
  PromptParams,
} from '../providers/types';

export type Prompt = {
  name: string;
  model: string;
  optionalModels?: string[];
  action?: string;
  messages: PromptMessage[];
  config?: PromptConfig;
};

export type ResolvedPrompt = {
  name: string;
  model: string;
  optionalModels: string[];
  action?: string;
  config?: PromptConfig;
  paramKeys: string[];
  params: PromptParams;
  source: 'built_in' | 'compat';
  messages?: PromptMessage[];
};

type PromptParamSpec = {
  default?: string;
  enum?: string[];
};

type PromptSpecMessage = {
  role: 'system' | 'assistant' | 'user';
  template: string;
};

export type PromptSpec = {
  name: string;
  action?: string;
  model: string;
  optionalModels?: string[];
  config?: PromptConfig;
  params?: Record<string, PromptParamSpec>;
  messages: PromptSpecMessage[];
};
