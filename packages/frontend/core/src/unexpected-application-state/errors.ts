export abstract class RecoverableError extends Error {
  protected ttl = 3;

  canRetry(): boolean {
    return this.ttl > 0;
  }

  abstract retry(): void;
}

// the first session request failed after login or signup succeed.
// should give a hint to the user to refetch the session.
export class SessionFetchErrorRightAfterLoginOrSignUp extends RecoverableError {
  constructor(
    message: string,
    private readonly onRetry: () => void
  ) {
    super(message);
  }

  retry(): void {
    if (this.ttl <= 0) {
      return;
    }
    try {
      this.onRetry();
    } catch (e) {
      console.error('Retry error', e);
    } finally {
      this.ttl--;
    }
  }
}
