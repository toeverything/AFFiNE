export class ServiceError extends Error {
  public message: string;
  public code: string;
  constructor(code: string, message: string) {
    super(message);
    this.message = message;
    this.code = code;
  }
}
