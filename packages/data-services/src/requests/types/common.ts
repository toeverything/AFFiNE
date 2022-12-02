export type CommonError = { error: { code: string; message: string } };
export type MayError = Partial<CommonError>;

export class ServicesError extends Error {
  public message: string;
  public code: string;
  constructor(code: string, message: string) {
    super(message);
    this.message = message;
    this.code = code;
  }
}
