enum EventErrorCode {
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  DOC_NOT_FOUND = 'DOC_NOT_FOUND',
  NOT_IN_WORKSPACE = 'NOT_IN_WORKSPACE',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INTERNAL = 'INTERNAL',
  VERSION_REJECTED = 'VERSION_REJECTED',
}

// Such errore are generally raised from the gateway handling to user,
// the stack must be full of internal code,
// so there is no need to inherit from `Error` class.
export class EventError {
  constructor(
    public readonly code: EventErrorCode,
    public readonly message: string
  ) {}

  toJSON() {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export class WorkspaceNotFoundError extends EventError {
  constructor(public readonly workspaceId: string) {
    super(
      EventErrorCode.WORKSPACE_NOT_FOUND,
      `You are trying to access an unknown workspace ${workspaceId}.`
    );
  }
}

export class DocNotFoundError extends EventError {
  constructor(
    public readonly workspaceId: string,
    public readonly docId: string
  ) {
    super(
      EventErrorCode.DOC_NOT_FOUND,
      `You are trying to access an unknown doc ${docId} under workspace ${workspaceId}.`
    );
  }
}

export class NotInWorkspaceError extends EventError {
  constructor(public readonly workspaceId: string) {
    super(
      EventErrorCode.NOT_IN_WORKSPACE,
      `You should join in workspace ${workspaceId} before broadcasting messages.`
    );
  }
}

export class AccessDeniedError extends EventError {
  constructor(public readonly workspaceId: string) {
    super(
      EventErrorCode.ACCESS_DENIED,
      `You have no permission to access workspace ${workspaceId}.`
    );
  }
}

export class InternalError extends EventError {
  constructor(public readonly error: Error) {
    super(EventErrorCode.INTERNAL, `Internal error happened: ${error.message}`);
  }
}

export class VersionRejectedError extends EventError {
  constructor(public readonly version: number) {
    super(
      EventErrorCode.VERSION_REJECTED,
      // TODO: Too general error message,
      // need to be more specific when versioning system is implemented.
      `The version ${version} is rejected by server.`
    );
  }
}
