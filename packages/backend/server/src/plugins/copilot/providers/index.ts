import { FalProvider } from './fal';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';
import { PerplexityProvider } from './perplexity';

export const CopilotProviders = [
  OpenAIProvider,
  FalProvider,
  GeminiProvider,
  PerplexityProvider,
];

export { CopilotProviderFactory } from './factory';
export { FalProvider } from './fal';
export { GeminiProvider } from './gemini';
export { OpenAIProvider } from './openai';
export { PerplexityProvider } from './perplexity';
export * from './types';
