import {
  CopilotPromptInvalid,
  CopilotQuotaExceeded,
  NetworkError,
} from '../../../base';

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
  const message = nativeErrorMessage(error)?.replace(
    /^\[affine-runtime:[a-z0-9_]+\]\s*/,
    ''
  );
  if (
    message === 'managed_target_unavailable' ||
    message === 'target_unavailable'
  ) {
    return new CopilotPromptInvalid(
      'The selected AI model is unavailable. Choose an available model and try again.'
    );
  }
  if (message === 'access_unavailable') {
    return new CopilotQuotaExceeded();
  }
  if (message?.startsWith(LLM_TIMEOUT_ERROR_PREFIX)) {
    return new NetworkError(
      message.slice(LLM_TIMEOUT_ERROR_PREFIX.length).trim() ||
        'LLM request timed out'
    );
  }
  return error;
}
