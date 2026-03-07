const GPT_4_RERANK_MODELS = /^(gpt-4(?:$|[.-]))/;
const GPT_5_RERANK_LOGPROBS_MODELS = /^(gpt-5\.2(?:$|-))/;

export const DEFAULT_RERANK_MODEL = 'gpt-5.2';
export const OPENAI_RERANK_TOP_LOGPROBS_LIMIT = 5;
export const OPENAI_RERANK_MAX_COMPLETION_TOKENS = 16;

export function supportsRerankModel(model: string): boolean {
  return (
    GPT_4_RERANK_MODELS.test(model) || GPT_5_RERANK_LOGPROBS_MODELS.test(model)
  );
}

export function usesRerankReasoning(model: string): boolean {
  return GPT_5_RERANK_LOGPROBS_MODELS.test(model);
}

export function normalizeRerankModel(model?: string | null): string {
  if (model && supportsRerankModel(model)) {
    return model;
  }
  return DEFAULT_RERANK_MODEL;
}
