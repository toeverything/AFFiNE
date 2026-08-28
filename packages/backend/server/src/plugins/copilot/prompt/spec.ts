import type { PromptConfig, PromptParams } from '../providers/types';

export type ResolvedPrompt = {
  name: string;
  action?: string;
  config?: PromptConfig;
  paramKeys: string[];
  params: PromptParams;
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
  config?: PromptConfig;
  params?: Record<string, PromptParamSpec>;
  messages: PromptSpecMessage[];
};
