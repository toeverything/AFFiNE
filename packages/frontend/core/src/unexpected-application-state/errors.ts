// the first session request failed after login or signup succeed.
// should give a hint to the user to refetch the session.
export class SessionFetchErrorRightAfterLoginOrSignUp extends Error {
  refetchSession = () => {};

  constructor(message: string, refetchSession: () => void) {
    super(message);
    this.refetchSession = refetchSession;
  }
}
