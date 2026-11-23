abstract class BaseAIError extends Error {
  abstract readonly type: AIErrorType;
}

export enum AIErrorType {
  GeneralNetworkError = 'GeneralNetworkError',
  PaymentRequired = 'PaymentRequired',
  Unauthorized = 'Unauthorized',
  RequestTimeout = 'RequestTimeout',
  SelectedSourcesProcessing = 'SelectedSourcesProcessing',
  SelectedSourcesFailed = 'SelectedSourcesFailed',
  SelectedSourcesUnavailable = 'SelectedSourcesUnavailable',
  SelectedSourcesLimitExceeded = 'SelectedSourcesLimitExceeded',
}

export class UnauthorizedError extends BaseAIError {
  readonly type = AIErrorType.Unauthorized;

  constructor() {
    super('Unauthorized');
  }
}

// user has used up the quota
export class PaymentRequiredError extends BaseAIError {
  readonly type = AIErrorType.PaymentRequired;

  constructor() {
    super('Payment required');
  }
}

// general 500x error
export class GeneralNetworkError extends BaseAIError {
  readonly type = AIErrorType.GeneralNetworkError;

  constructor(message: string = 'Network error') {
    super(message);
  }
}

// request timeout
export class RequestTimeoutError extends BaseAIError {
  readonly type = AIErrorType.RequestTimeout;

  constructor(message: string = 'Request timeout') {
    super(message);
  }
}

export class SelectedSourcesProcessingError extends BaseAIError {
  readonly type = AIErrorType.SelectedSourcesProcessing;

  constructor(message: string) {
    super(message);
  }
}

export class SelectedSourcesFailedError extends BaseAIError {
  readonly type = AIErrorType.SelectedSourcesFailed;

  constructor(message: string) {
    super(message);
  }
}

export class SelectedSourcesUnavailableError extends BaseAIError {
  readonly type = AIErrorType.SelectedSourcesUnavailable;

  constructor(message: string) {
    super(message);
  }
}

export class SelectedSourcesLimitExceededError extends BaseAIError {
  readonly type = AIErrorType.SelectedSourcesLimitExceeded;

  constructor(message: string) {
    super(message);
  }
}

export type AIError =
  | UnauthorizedError
  | PaymentRequiredError
  | GeneralNetworkError
  | RequestTimeoutError
  | SelectedSourcesProcessingError
  | SelectedSourcesFailedError
  | SelectedSourcesUnavailableError
  | SelectedSourcesLimitExceededError;
