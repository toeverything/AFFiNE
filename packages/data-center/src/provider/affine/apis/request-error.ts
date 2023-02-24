export class RequestError extends Error {
  constructor(message: string, cause: unknown | null = null) {
    super(message);
    this.name = 'RequestError';
    this.cause = cause;
  }
}

export default RequestError;
