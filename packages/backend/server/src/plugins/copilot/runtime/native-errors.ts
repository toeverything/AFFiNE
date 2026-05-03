import { NetworkError } from '../../../base';

const LLM_TIMEOUT_ERROR_PREFIX = 'llm_timeout:';

function nativeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    error &&
    typeof error === 'object' &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return typeof error === 'string' ? error : undefined;
}

export function mapNativeSemanticError(error: unknown): unknown {
  const message = nativeErrorMessage(error);
  if (message?.startsWith(LLM_TIMEOUT_ERROR_PREFIX)) {
    return new NetworkError(
      message.slice(LLM_TIMEOUT_ERROR_PREFIX.length).trim() ||
        'LLM request timed out'
    );
  }
  return error;
}
