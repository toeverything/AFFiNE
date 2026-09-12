export interface UserFriendlyPayload {
  status: number;
  code: string;
  type: string;
  name: string;
  message: string;
  data?: Record<string, unknown> | undefined;
}

export class AppError extends Error {
  readonly status: number;
  /** Fastify reads `statusCode` on thrown errors. */
  readonly statusCode: number;
  readonly code: string;
  readonly type: string;
  override readonly name: string;
  readonly data: Record<string, unknown> | undefined;

  constructor(payload: UserFriendlyPayload) {
    super(payload.message);
    this.status = payload.status;
    this.statusCode = payload.status;
    this.code = payload.code;
    this.type = payload.type;
    this.name = payload.name;
    this.data = payload.data;
  }

  toJSON(): UserFriendlyPayload {
    return {
      status: this.status,
      code: this.code,
      type: this.type,
      name: this.name,
      message: this.message,
      ...(this.data ? { data: this.data } : {}),
    };
  }
}

function err(
  status: number,
  name: string,
  message: string,
  data?: Record<string, unknown>
): AppError {
  const payload: UserFriendlyPayload = {
    status,
    code: name,
    type: name,
    name,
    message,
  };
  if (data) {
    payload.data = data;
  }
  return new AppError(payload);
}

export const errors = {
  badRequest: (message: string) => err(400, 'BAD_REQUEST', message),
  invalidEmail: () => err(400, 'INVALID_EMAIL', 'Invalid email address.'),
  invalidPasswordLength: (min: number, max: number) =>
    err(400, 'INVALID_PASSWORD_LENGTH', 'Invalid password length.', {
      min,
      max,
    }),
  wrongCredentials: () =>
    err(400, 'WRONG_SIGN_IN_CREDENTIALS', 'Wrong sign in credentials.'),
  passwordRequired: () =>
    err(400, 'PASSWORD_REQUIRED', 'Password is required.'),
  tooManyRequests: () =>
    err(429, 'TOO_MANY_REQUEST', 'Too many requests.', undefined),
  authenticationRequired: () =>
    err(401, 'AUTHENTICATION_REQUIRED', 'You must sign in first.'),
  accessDenied: () => err(403, 'ACCESS_DENIED', 'You do not have permission.'),
  signUpForbidden: () =>
    err(403, 'SIGN_UP_FORBIDDEN', 'You are not allowed to sign up.'),
  userNotFound: () => err(404, 'USER_NOT_FOUND', 'User not found.'),
  spaceNotFound: () => err(404, 'SPACE_NOT_FOUND', 'Workspace not found.'),
  spaceAccessDenied: (spaceId: string) =>
    err(
      403,
      'SPACE_ACCESS_DENIED',
      'You do not have access to this workspace.',
      {
        spaceId,
      }
    ),
  emailAlreadyUsed: () =>
    err(400, 'EMAIL_ALREADY_USED', 'This email is already used.'),
  actionForbidden: (message = 'This action is forbidden.') =>
    err(400, 'ACTION_FORBIDDEN', message),
  emailServiceNotConfigured: () =>
    err(
      501,
      'EMAIL_SERVICE_NOT_CONFIGURED',
      'Email sign-in is not configured on this Mosaic server.'
    ),
  unknownOauth: () =>
    err(400, 'UNKNOWN_OAUTH_PROVIDER', 'OAuth is not enabled.'),
  sessionExpired: () =>
    err(401, 'AUTH_SESSION_EXPIRED', 'Auth session expired.'),
  sessionRevoked: () =>
    err(401, 'AUTH_SESSION_REVOKED', 'Auth session revoked.'),
  accessTokenExpired: () =>
    err(401, 'ACCESS_TOKEN_EXPIRED', 'Access token expired.'),
  accessTokenInvalid: () =>
    err(401, 'ACCESS_TOKEN_INVALID', 'Access token is invalid.'),
  refreshTokenInvalid: () =>
    err(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid.'),
  refreshTokenReused: () =>
    err(401, 'REFRESH_TOKEN_REUSED', 'Refresh token was reused.'),
  invalidAuthState: () => err(400, 'INVALID_AUTH_STATE', 'Invalid auth state.'),
  docNotFound: () => err(404, 'DOC_NOT_FOUND', 'Document not found.'),
  docActionDenied: (message = 'You cannot modify this document.') =>
    err(403, 'DOC_ACTION_DENIED', message),
  docUpdateTooLarge: () =>
    err(413, 'CONTENT_TOO_LARGE', 'Document update is too large.'),
  joinBatchTooLarge: (max: number) =>
    err(400, 'BAD_REQUEST', `Join batch exceeds limit of ${max}.`, { max }),
  invalidSpaceType: () => err(400, 'BAD_REQUEST', 'Invalid space type.'),
  blobNotFound: (spaceId: string, blobId: string) =>
    err(404, 'BLOB_NOT_FOUND', 'Blob not found.', { spaceId, blobId }),
  blobQuotaExceeded: () =>
    err(413, 'BLOB_QUOTA_EXCEEDED', 'Blob exceeds the size limit.'),
  storageQuotaExceeded: () =>
    err(413, 'STORAGE_QUOTA_EXCEEDED', 'Workspace storage quota exceeded.'),
  contentTooLarge: (message = 'Content too large.') =>
    err(413, 'CONTENT_TOO_LARGE', message),
  historyNotFound: (spaceId: string, docId: string, timestamp: number) =>
    err(404, 'DOC_HISTORY_NOT_FOUND', 'Document history not found.', {
      spaceId,
      docId,
      timestamp,
    }),
  alreadyInSpace: (spaceId: string) =>
    err(
      400,
      'ALREADY_IN_SPACE',
      'You are already a member of this workspace.',
      {
        spaceId,
      }
    ),
  invalidInvitation: () =>
    err(400, 'INVALID_INVITATION', 'Invitation is invalid or expired.'),
  invitationAccountMismatch: () =>
    err(
      400,
      'INVITATION_ACCOUNT_MISMATCH',
      'This invitation was sent to a different account.'
    ),
  memberNotFoundInSpace: (spaceId: string) =>
    err(
      404,
      'MEMBER_NOT_FOUND_IN_SPACE',
      'Member not found in this workspace.',
      {
        spaceId,
      }
    ),
  commentNotFound: () => err(404, 'NOT_FOUND', 'Comment not found.'),
  invalidOauthState: () =>
    err(400, 'INVALID_AUTH_STATE', 'OAuth state is invalid or expired.'),
  samlInvalid: () =>
    err(400, 'INVALID_AUTH_STATE', 'SAML response is invalid.'),
  ssoRequired: () =>
    err(403, 'ACTION_FORBIDDEN', 'This account must sign in with SSO.'),
  guestDomainDenied: () =>
    err(
      403,
      'ACTION_FORBIDDEN',
      'This email domain is not allowed for workspace guests.'
    ),
  publicLinksBlocked: () =>
    err(
      403,
      'ACTION_FORBIDDEN',
      'Public links are disabled for this workspace.'
    ),
  copilotDisabled: () =>
    err(
      501,
      'ACTION_FORBIDDEN',
      'AI gateway is not configured. Set MOSAIC_AI_API_KEY (BYOK).'
    ),
  webhookNotFound: () => err(404, 'NOT_FOUND', 'Webhook not found.'),
  jiraNotConfigured: () =>
    err(
      501,
      'ACTION_FORBIDDEN',
      'Jira is not configured on this Mosaic server.'
    ),
};
