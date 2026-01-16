import { STATUS_CODES } from 'node:http';
import { escape } from 'node:querystring';

import { HttpStatus, Logger } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';

export type UserFriendlyErrorBaseType =
  | 'network_error'
  | 'bad_request'
  | 'too_many_requests'
  | 'resource_not_found'
  | 'resource_already_exists'
  | 'invalid_input'
  | 'action_forbidden'
  | 'no_permission'
  | 'quota_exceeded'
  | 'authentication_required'
  | 'internal_server_error';

type ErrorArgType = 'string' | 'number' | 'boolean';
type ErrorArgs = Record<string, ErrorArgType>;

export type UserFriendlyErrorOptions = {
  type: UserFriendlyErrorBaseType;
  args?: ErrorArgs;
  message: string | ((args: any) => string);
};

const BaseTypeToHttpStatusMap: Record<UserFriendlyErrorBaseType, HttpStatus> = {
  network_error: HttpStatus.GATEWAY_TIMEOUT,
  too_many_requests: HttpStatus.TOO_MANY_REQUESTS,
  bad_request: HttpStatus.BAD_REQUEST,
  resource_not_found: HttpStatus.NOT_FOUND,
  resource_already_exists: HttpStatus.BAD_REQUEST,
  invalid_input: HttpStatus.BAD_REQUEST,
  action_forbidden: HttpStatus.FORBIDDEN,
  no_permission: HttpStatus.FORBIDDEN,
  quota_exceeded: HttpStatus.PAYMENT_REQUIRED,
  authentication_required: HttpStatus.UNAUTHORIZED,
  internal_server_error: HttpStatus.INTERNAL_SERVER_ERROR,
};

const IncludedEvents = new Set([
  // email
  'invalid_email',
  'email_token_not_found',
  'invalid_email_token',
  'email_already_used',
  'same_email_provided',
  // magic link
  'action_forbidden',
  'link_expired',
  'email_verification_required',
  // oauth
  'missing_oauth_query_parameter',
  'unknown_oauth_provider',
  'invalid_oauth_callback_state',
  'invalid_oauth_state',
  'oauth_state_expired',
  'oauth_account_already_connected',
]);

export class UserFriendlyError extends Error {
  /**
   * Standard HTTP status code
   */
  status: number;

  /**
   * Business error category, for example 'resource_already_exists' or 'quota_exceeded'
   */
  type: string;

  /**
   * Additional data that could be used for error handling or formatting
   */
  data: any;

  /**
   * Request id for tracing
   */
  requestId?: string;

  constructor(
    type: UserFriendlyErrorBaseType,
    name: keyof typeof USER_FRIENDLY_ERRORS,
    message?: string | ((args?: any) => string),
    args?: any
  ) {
    const defaultMsg = USER_FRIENDLY_ERRORS[name].message;
    // disallow message override for `internal_server_error`
    // to avoid leak internal information to user
    let msg =
      name === 'internal_server_error' ? defaultMsg : (message ?? defaultMsg);

    if (typeof msg === 'function') {
      msg = msg(args);
    }

    super(msg);
    this.status = BaseTypeToHttpStatusMap[type];
    this.type = type;
    this.name = name;
    this.data = args;
    this.requestId = ClsServiceManager.getClsService()?.getId();
  }

  static fromUserFriendlyErrorJSON(body: UserFriendlyError) {
    return new UserFriendlyError(
      body.type.toLowerCase() as UserFriendlyErrorBaseType,
      body.name.toLowerCase() as keyof typeof USER_FRIENDLY_ERRORS,
      body.message,
      body.data
    );
  }

  get stacktrace() {
    return this.name === 'internal_server_error'
      ? ((this.cause as Error)?.stack ?? this.stack)
      : this.stack;
  }

  toJSON() {
    return {
      status: this.status,
      code: STATUS_CODES[this.status] ?? 'BAD REQUEST',
      type: this.type.toUpperCase(),
      name: this.name.toUpperCase(),
      message: this.message,
      data: this.data,
      // only include requestId for server error
      requestId: this.status >= 500 ? this.requestId : undefined,
    };
  }

  toText() {
    const json = this.toJSON();
    return [
      `Status: ${json.status}`,
      `Type: ${json.type}`,
      `Name: ${json.name}`,
      `Message: ${json.message}`,
      `Data: ${JSON.stringify(json.data)}`,
      `RequestId: ${json.requestId}`,
    ].join('\n');
  }

  log(context: string, debugInfo?: object) {
    // ignore all user behavior error log
    if (
      this.type !== 'internal_server_error' &&
      !IncludedEvents.has(this.name)
    ) {
      return;
    }

    const logger = new Logger(context);
    const fn = this.status >= 500 ? logger.error : logger.log;

    let message = this.name;
    if (debugInfo) {
      message += ` (${JSON.stringify(debugInfo)})`;
    }
    fn.call(logger, message, this);
  }
}

/**
 *
 * @ObjectType()
 * export class XXXDataType {
 *   @Field()
 *   [name]: [type];
 * }
 */
function generateErrorArgs(name: string, args: ErrorArgs) {
  const typeName = `${name}DataType`;
  const lines = [`@ObjectType()`, `class ${typeName} {`];
  Object.entries(args).forEach(([arg, fieldArgs]) => {
    lines.push(`  @Field() ${arg}!: ${fieldArgs}`);
  });

  lines.push('}');

  return { name: typeName, def: lines.join('\n') };
}

export function generateUserFriendlyErrors() {
  const output = [
    '/* oxlint-disable */',
    '// AUTO GENERATED FILE',
    `import { createUnionType, Field, ObjectType, registerEnumType } from '@nestjs/graphql';`,
    '',
    `import { UserFriendlyError } from './def';`,
  ];

  const errorNames: string[] = [];
  const argTypes: string[] = [];

  for (const code in USER_FRIENDLY_ERRORS) {
    errorNames.push(code.toUpperCase());
    // @ts-expect-error allow
    const options: UserFriendlyErrorOptions = USER_FRIENDLY_ERRORS[code];
    const className = code
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    const args = options.args
      ? generateErrorArgs(className, options.args)
      : null;

    const classDef = `
export class ${className} extends UserFriendlyError {
  constructor(${args ? `args: ${args.name}, ` : ''}message?: string${args ? ` | ((args: ${args.name}) => string)` : ''}) {
    super('${options.type}', '${code}', message${args ? ', args' : ''});
  }
}`;

    if (args) {
      output.push(args.def);
      argTypes.push(args.name);
    }
    output.push(classDef);
  }

  output.push(`export enum ErrorNames {
  ${errorNames.join(',\n  ')}
}
registerEnumType(ErrorNames, {
  name: 'ErrorNames'
})

export const ErrorDataUnionType = createUnionType({
  name: 'ErrorDataUnion',
  types: () =>
    [${argTypes.join(', ')}] as const,
});
`);

  return output.join('\n');
}

// DEFINE ALL USER FRIENDLY ERRORS HERE
export const USER_FRIENDLY_ERRORS = {
  // Internal uncaught errors
  internal_server_error: {
    type: 'internal_server_error',
    message: 'An internal error occurred.',
  },
  network_error: {
    type: 'network_error',
    message: 'Network error.',
  },
  too_many_request: {
    type: 'too_many_requests',
    message: 'Too many requests.',
  },
  not_found: {
    type: 'resource_not_found',
    message: 'Resource not found.',
  },
  bad_request: {
    type: 'bad_request',
    message: 'Bad request.',
  },
  graphql_bad_request: {
    type: 'bad_request',
    args: { code: 'string', message: 'string' },
    message: ({ code, message }) =>
      `GraphQL bad request, code: ${code}, ${message}`,
  },
  http_request_error: {
    type: 'bad_request',
    args: { message: 'string' },
    message: ({ message }) => `HTTP request error, message: ${message}`,
  },
  email_service_not_configured: {
    type: 'internal_server_error',
    message: 'Email service is not configured.',
  },

  // Input errors
  query_too_long: {
    type: 'invalid_input',
    args: { max: 'number' },
    message: ({ max }) => `Query is too long, max length is ${max}.`,
  },

  validation_error: {
    type: 'invalid_input',
    args: { errors: 'string' },
    message: ({ errors }) => `Validation error, errors: ${errors}`,
  },

  // User Errors
  user_not_found: {
    type: 'resource_not_found',
    message: 'User not found.',
  },
  user_avatar_not_found: {
    type: 'resource_not_found',
    message: 'User avatar not found.',
  },
  email_already_used: {
    type: 'resource_already_exists',
    message: 'This email has already been registered.',
  },
  same_email_provided: {
    type: 'invalid_input',
    message:
      'You are trying to update your account email to the same as the old one.',
  },
  wrong_sign_in_credentials: {
    type: 'invalid_input',
    args: { email: 'string' },
    message: ({ email }) => `Wrong user email or password: ${email}`,
  },
  unknown_oauth_provider: {
    type: 'invalid_input',
    args: { name: 'string' },
    message: ({ name }) => `Unknown authentication provider ${name}.`,
  },
  oauth_state_expired: {
    type: 'bad_request',
    message: 'OAuth state expired, please try again.',
  },
  invalid_oauth_callback_state: {
    type: 'bad_request',
    message: 'Invalid callback state parameter.',
  },
  invalid_oauth_callback_code: {
    type: 'bad_request',
    args: { status: 'number', body: 'string' },
    message: ({ status, body }) =>
      `Invalid callback code parameter, provider response status: ${status} and body: ${body}.`,
  },
  invalid_auth_state: {
    type: 'bad_request',
    message:
      'Invalid auth state. You might start the auth progress from another device.',
  },
  missing_oauth_query_parameter: {
    type: 'bad_request',
    args: { name: 'string' },
    message: ({ name }) => `Missing query parameter \`${name}\`.`,
  },
  oauth_account_already_connected: {
    type: 'bad_request',
    message:
      'The third-party account has already been connected to another user.',
  },
  invalid_oauth_response: {
    type: 'bad_request',
    args: { reason: 'string' },
    message: ({ reason }) => `Invalid OAuth response: ${reason}.`,
  },
  invalid_email: {
    type: 'invalid_input',
    args: { email: 'string' },
    message: ({ email }) => `An invalid email provided: ${email}`,
  },
  invalid_password_length: {
    type: 'invalid_input',
    args: { min: 'number', max: 'number' },
    message: ({ min, max }) =>
      `Password must be between ${min} and ${max} characters`,
  },
  password_required: {
    type: 'invalid_input',
    message: 'Password is required.',
  },
  wrong_sign_in_method: {
    type: 'invalid_input',
    message:
      'You are trying to sign in by a different method than you signed up with.',
  },
  sign_up_forbidden: {
    type: 'action_forbidden',
    message: `You are not allowed to sign up.`,
  },
  email_token_not_found: {
    type: 'invalid_input',
    message: 'The email token provided is not found.',
  },
  invalid_email_token: {
    type: 'invalid_input',
    message: 'An invalid email token provided.',
  },
  link_expired: {
    type: 'bad_request',
    message: 'The link has expired.',
  },

  // Authentication & Permission Errors
  authentication_required: {
    type: 'authentication_required',
    message: 'You must sign in first to access this resource.',
  },
  action_forbidden: {
    type: 'action_forbidden',
    message: 'You are not allowed to perform this action.',
  },
  access_denied: {
    type: 'no_permission',
    message: 'You do not have permission to access this resource.',
  },
  email_verification_required: {
    type: 'action_forbidden',
    message: 'You must verify your email before accessing this resource.',
  },

  // Workspace & Userspace & Doc & Sync errors
  workspace_permission_not_found: {
    type: 'resource_not_found',
    args: { spaceId: 'string' },
    message: ({ spaceId }) => `Space ${spaceId} permission not found.`,
  },
  space_not_found: {
    type: 'resource_not_found',
    args: { spaceId: 'string' },
    message: ({ spaceId }) => `Space ${spaceId} not found.`,
  },
  member_not_found_in_space: {
    type: 'action_forbidden',
    args: { spaceId: 'string' },
    message: ({ spaceId }) => `Member not found in Space ${spaceId}.`,
  },
  not_in_space: {
    type: 'action_forbidden',
    args: { spaceId: 'string' },
    message: ({ spaceId }) =>
      `You should join in Space ${spaceId} before broadcasting messages.`,
  },
  already_in_space: {
    type: 'action_forbidden',
    args: { spaceId: 'string' },
    message: ({ spaceId }) => `You have already joined in Space ${spaceId}.`,
  },
  space_access_denied: {
    type: 'no_permission',
    args: { spaceId: 'string' },
    message: ({ spaceId }) =>
      `You do not have permission to access Space ${spaceId}.`,
  },
  space_owner_not_found: {
    type: 'internal_server_error',
    args: { spaceId: 'string' },
    message: ({ spaceId }) => `Owner of Space ${spaceId} not found.`,
  },
  space_should_have_only_one_owner: {
    type: 'invalid_input',
    args: { spaceId: 'string' },
    message: 'Space should have only one owner.',
  },
  owner_can_not_leave_workspace: {
    type: 'action_forbidden',
    message: 'Owner can not leave the workspace.',
  },
  can_not_revoke_yourself: {
    type: 'action_forbidden',
    message: 'You can not revoke your own permission.',
  },
  doc_not_found: {
    type: 'resource_not_found',
    args: { spaceId: 'string', docId: 'string' },
    message: ({ spaceId, docId }) =>
      `Doc ${docId} under Space ${spaceId} not found.`,
  },
  doc_action_denied: {
    type: 'no_permission',
    args: { spaceId: 'string', docId: 'string', action: 'string' },
    message: ({ docId, action }) =>
      `You do not have permission to perform ${action} action on doc ${docId}.`,
  },
  doc_update_blocked: {
    type: 'action_forbidden',
    args: { spaceId: 'string', docId: 'string' },
    message: ({ spaceId, docId }) =>
      `Doc ${docId} under Space ${spaceId} is blocked from updating.`,
  },
  version_rejected: {
    type: 'action_forbidden',
    args: { version: 'string', serverVersion: 'string' },
    message: ({ version, serverVersion }) =>
      `Your client with version ${version} is rejected by remote sync server. Please upgrade to ${serverVersion}.`,
  },
  invalid_history_timestamp: {
    type: 'invalid_input',
    args: { timestamp: 'string' },
    message: 'Invalid doc history timestamp provided.',
  },
  doc_history_not_found: {
    type: 'resource_not_found',
    args: { spaceId: 'string', docId: 'string', timestamp: 'number' },
    message: ({ spaceId, docId, timestamp }) =>
      `History of ${docId} at ${timestamp} under Space ${spaceId}.`,
  },
  blob_not_found: {
    type: 'resource_not_found',
    args: { spaceId: 'string', blobId: 'string' },
    message: ({ spaceId, blobId }) =>
      `Blob ${blobId} not found in Space ${spaceId}.`,
  },
  blob_invalid: {
    type: 'invalid_input',
    message: 'Blob is invalid.',
  },
  expect_to_publish_doc: {
    type: 'invalid_input',
    message: 'Expected to publish a doc, not a Space.',
  },
  expect_to_revoke_public_doc: {
    type: 'invalid_input',
    message: 'Expected to revoke a public doc, not a Space.',
  },
  expect_to_grant_doc_user_roles: {
    type: 'invalid_input',
    args: { spaceId: 'string', docId: 'string' },
    message: ({ spaceId, docId }) =>
      `Expect grant roles on doc ${docId} under Space ${spaceId}, not a Space.`,
  },
  expect_to_revoke_doc_user_roles: {
    type: 'invalid_input',
    args: { spaceId: 'string', docId: 'string' },
    message: ({ spaceId, docId }) =>
      `Expect revoke roles on doc ${docId} under Space ${spaceId}, not a Space.`,
  },
  expect_to_update_doc_user_role: {
    type: 'invalid_input',
    args: { spaceId: 'string', docId: 'string' },
    message: ({ spaceId, docId }) =>
      `Expect update roles on doc ${docId} under Space ${spaceId}, not a Space.`,
  },
  doc_is_not_public: {
    type: 'bad_request',
    message: 'Doc is not public.',
  },
  failed_to_save_updates: {
    type: 'internal_server_error',
    message: 'Failed to store doc updates.',
  },
  failed_to_upsert_snapshot: {
    type: 'internal_server_error',
    message: 'Failed to store doc snapshot.',
  },
  action_forbidden_on_non_team_workspace: {
    type: 'action_forbidden',
    message: 'A Team workspace is required to perform this action.',
  },
  doc_default_role_can_not_be_owner: {
    type: 'invalid_input',
    message: 'Doc default role can not be owner.',
  },
  can_not_batch_grant_doc_owner_permissions: {
    type: 'invalid_input',
    message: 'Can not batch grant doc owner permissions.',
  },
  new_owner_is_not_active_member: {
    type: 'bad_request',
    message: 'Can not set a non-active member as owner.',
  },
  invalid_invitation: {
    type: 'invalid_input',
    message: 'Invalid invitation provided.',
  },
  no_more_seat: {
    type: 'bad_request',
    args: { spaceId: 'string' },
    message: ({ spaceId }) => `No more seat available in the Space ${spaceId}.`,
  },

  // Subscription Errors
  unsupported_subscription_plan: {
    type: 'invalid_input',
    args: { plan: 'string' },
    message: ({ plan }) => `Unsupported subscription plan: ${plan}.`,
  },
  failed_to_checkout: {
    type: 'internal_server_error',
    message: 'Failed to create checkout session.',
  },
  invalid_checkout_parameters: {
    type: 'invalid_input',
    message: 'Invalid checkout parameters provided.',
  },
  subscription_already_exists: {
    type: 'resource_already_exists',
    args: { plan: 'string' },
    message: ({ plan }) => `You have already subscribed to the ${plan} plan.`,
  },
  invalid_subscription_parameters: {
    type: 'invalid_input',
    message: 'Invalid subscription parameters provided.',
  },
  subscription_not_exists: {
    type: 'resource_not_found',
    args: { plan: 'string' },
    message: ({ plan }) => `You didn't subscribe to the ${plan} plan.`,
  },
  subscription_has_been_canceled: {
    type: 'action_forbidden',
    message: 'Your subscription has already been canceled.',
  },
  subscription_has_not_been_canceled: {
    type: 'action_forbidden',
    message: 'Your subscription has not been canceled.',
  },
  subscription_expired: {
    type: 'action_forbidden',
    message: 'Your subscription has expired.',
  },
  same_subscription_recurring: {
    type: 'bad_request',
    args: { recurring: 'string' },
    message: ({ recurring }) =>
      `Your subscription has already been in ${recurring} recurring state.`,
  },
  customer_portal_create_failed: {
    type: 'internal_server_error',
    message: 'Failed to create customer portal session.',
  },
  subscription_plan_not_found: {
    type: 'resource_not_found',
    args: { plan: 'string', recurring: 'string' },
    message: 'You are trying to access a unknown subscription plan.',
  },
  cant_update_onetime_payment_subscription: {
    type: 'action_forbidden',
    message: 'You cannot update an onetime payment subscription.',
  },
  workspace_id_required_for_team_subscription: {
    type: 'invalid_input',
    message: 'A workspace is required to checkout for team subscription.',
  },
  workspace_id_required_to_update_team_subscription: {
    type: 'invalid_input',
    message: 'Workspace id is required to update team subscription.',
  },
  managed_by_app_store_or_play: {
    type: 'action_forbidden',
    message:
      'This subscription is managed by App Store or Google Play. Please manage it in the corresponding store.',
  },

  // Calendar errors
  calendar_provider_request_error: {
    type: 'internal_server_error',
    args: { status: 'number', message: 'string' },
    message: ({ status, message }) =>
      `Calendar provider request error, status: ${status}, message: ${message}`,
  },

  // Copilot errors
  copilot_session_not_found: {
    type: 'resource_not_found',
    message: `Copilot session not found.`,
  },
  copilot_session_invalid_input: {
    type: 'invalid_input',
    message: `Copilot session input is invalid.`,
  },
  copilot_session_deleted: {
    type: 'action_forbidden',
    message: `Copilot session has been deleted.`,
  },
  no_copilot_provider_available: {
    type: 'internal_server_error',
    args: { modelId: 'string' },
    message: ({ modelId }) => `No copilot provider available: ${modelId}`,
  },
  copilot_failed_to_generate_text: {
    type: 'internal_server_error',
    message: `Failed to generate text.`,
  },
  copilot_failed_to_generate_embedding: {
    type: 'internal_server_error',
    args: { provider: 'string', message: 'string' },
    message: ({ provider, message }) =>
      `Failed to generate embedding with ${provider}: ${message}`,
  },
  copilot_failed_to_create_message: {
    type: 'internal_server_error',
    message: `Failed to create chat message.`,
  },
  unsplash_is_not_configured: {
    type: 'internal_server_error',
    message: `Unsplash is not configured.`,
  },
  copilot_action_taken: {
    type: 'action_forbidden',
    message: `Action has been taken, no more messages allowed.`,
  },
  copilot_doc_not_found: {
    type: 'resource_not_found',
    args: { docId: 'string' },
    message: ({ docId }) => `Doc ${docId} not found.`,
  },
  copilot_docs_not_found: {
    type: 'resource_not_found',
    message: () => `Some docs not found.`,
  },
  copilot_message_not_found: {
    type: 'resource_not_found',
    args: { messageId: 'string' },
    message: ({ messageId }) => `Copilot message ${messageId} not found.`,
  },
  copilot_prompt_not_found: {
    type: 'resource_not_found',
    args: { name: 'string' },
    message: ({ name }) => `Copilot prompt ${name} not found.`,
  },
  copilot_prompt_invalid: {
    type: 'invalid_input',
    message: `Copilot prompt is invalid.`,
  },
  copilot_provider_not_supported: {
    type: 'invalid_input',
    args: { provider: 'string', kind: 'string' },
    message: ({ provider, kind }) =>
      `Copilot provider ${provider} does not support output type ${kind}`,
  },
  copilot_provider_side_error: {
    type: 'internal_server_error',
    args: { provider: 'string', kind: 'string', message: 'string' },
    message: ({ provider, kind, message }) =>
      `Provider ${provider} failed with ${kind} error: ${message || 'unknown'}`,
  },
  copilot_invalid_context: {
    type: 'invalid_input',
    args: { contextId: 'string' },
    message: ({ contextId }) => `Invalid copilot context ${contextId}.`,
  },
  copilot_context_file_not_supported: {
    type: 'bad_request',
    args: { fileName: 'string', message: 'string' },
    message: ({ fileName, message }) =>
      `File ${fileName} is not supported to use as context: ${message}`,
  },
  copilot_failed_to_modify_context: {
    type: 'internal_server_error',
    args: { contextId: 'string', message: 'string' },
    message: ({ contextId, message }) =>
      `Failed to modify context ${contextId}: ${message}`,
  },
  copilot_failed_to_match_context: {
    type: 'internal_server_error',
    args: { contextId: 'string', content: 'string', message: 'string' },
    message: ({ contextId, content, message }) =>
      `Failed to match context ${contextId} with "${escape(content)}": ${message}`,
  },
  copilot_failed_to_match_global_context: {
    type: 'internal_server_error',
    args: { workspaceId: 'string', content: 'string', message: 'string' },
    message: ({ workspaceId, content, message }) =>
      `Failed to match context in workspace ${workspaceId} with "${escape(content)}": ${message}`,
  },
  copilot_embedding_disabled: {
    type: 'action_forbidden',
    message: `Embedding feature is disabled, please contact the administrator to enable it in the workspace settings.`,
  },
  copilot_embedding_unavailable: {
    type: 'action_forbidden',
    message: `Embedding feature not available, you may need to install pgvector extension to your database`,
  },
  copilot_transcription_job_exists: {
    type: 'bad_request',
    message: 'Transcription job already exists',
  },
  copilot_transcription_job_not_found: {
    type: 'bad_request',
    message: `Transcription job not found.`,
  },
  copilot_transcription_audio_not_provided: {
    type: 'bad_request',
    message: `Audio not provided.`,
  },
  copilot_failed_to_add_workspace_file_embedding: {
    type: 'internal_server_error',
    args: { message: 'string' },
    message: ({ message }) =>
      `Failed to add workspace file embedding: ${message}`,
  },

  // Quota & Limit errors
  blob_quota_exceeded: {
    type: 'quota_exceeded',
    message: 'You have exceeded your blob size quota.',
  },
  storage_quota_exceeded: {
    type: 'quota_exceeded',
    message: 'You have exceeded your storage quota.',
  },
  member_quota_exceeded: {
    type: 'quota_exceeded',
    message: 'You have exceeded your workspace member quota.',
  },
  copilot_quota_exceeded: {
    type: 'quota_exceeded',
    message:
      'You have reached the limit of actions in this workspace, please upgrade your plan.',
  },

  // Config errors
  runtime_config_not_found: {
    type: 'resource_not_found',
    args: { key: 'string' },
    message: ({ key }) => `Runtime config ${key} not found.`,
  },
  invalid_runtime_config_type: {
    type: 'invalid_input',
    args: { key: 'string', want: 'string', get: 'string' },
    message: ({ key, want, get }) =>
      `Invalid runtime config type  for '${key}', want '${want}', but get ${get}.`,
  },
  mailer_service_is_not_configured: {
    type: 'internal_server_error',
    message: 'Mailer service is not configured.',
  },
  cannot_delete_all_admin_account: {
    type: 'action_forbidden',
    message: 'Cannot delete all admin accounts.',
  },

  // Account errors
  cannot_delete_own_account: {
    type: 'action_forbidden',
    message: 'Cannot delete own account.',
  },
  cannot_delete_account_with_owned_team_workspace: {
    type: 'action_forbidden',
    message:
      'Cannot delete account. You are the owner of one or more team workspaces. Please transfer ownership or delete them first.',
  },

  // captcha errors
  captcha_verification_failed: {
    type: 'bad_request',
    message: 'Captcha verification failed.',
  },

  // license errors
  invalid_license_session_id: {
    type: 'invalid_input',
    message: 'Invalid session id to generate license key.',
  },
  license_revealed: {
    type: 'action_forbidden',
    message:
      'License key has been revealed. Please check your mail box of the one provided during checkout.',
  },
  workspace_license_already_exists: {
    type: 'action_forbidden',
    message: 'Workspace already has a license applied.',
  },
  license_not_found: {
    type: 'resource_not_found',
    message: 'License not found.',
  },
  invalid_license_to_activate: {
    type: 'bad_request',
    args: { reason: 'string' },
    message: ({ reason }) => `Invalid license to activate. ${reason}`,
  },
  invalid_license_update_params: {
    type: 'invalid_input',
    args: { reason: 'string' },
    message: ({ reason }) => `Invalid license update params. ${reason}`,
  },
  license_expired: {
    type: 'bad_request',
    message: 'License has expired.',
  },

  // version errors
  unsupported_client_version: {
    type: 'action_forbidden',
    args: {
      clientVersion: 'string',
      requiredVersion: 'string',
    },
    message: ({ clientVersion, requiredVersion }) =>
      `Unsupported client with version [${clientVersion}], required version is [${requiredVersion}].`,
  },

  // Notification Errors
  notification_not_found: {
    type: 'resource_not_found',
    message: 'Notification not found.',
  },
  mention_user_doc_access_denied: {
    type: 'no_permission',
    args: { docId: 'string' },
    message: ({ docId }) => `Mentioned user can not access doc ${docId}.`,
  },
  mention_user_oneself_denied: {
    type: 'action_forbidden',
    message: 'You can not mention yourself.',
  },

  // app config
  invalid_app_config: {
    type: 'invalid_input',
    args: { module: 'string', key: 'string', hint: 'string' },
    message: ({ module, key, hint }) =>
      `Invalid app config for module \`${module}\` with key \`${key}\`. ${hint}.`,
  },
  invalid_app_config_input: {
    type: 'invalid_input',
    args: { message: 'string' },
    message: ({ message }) => `Invalid app config input: ${message}`,
  },

  // indexer errors
  search_provider_not_found: {
    type: 'resource_not_found',
    message: 'Search provider not found.',
  },
  invalid_search_provider_request: {
    type: 'invalid_input',
    args: { reason: 'string', type: 'string' },
    message: ({ reason }) =>
      `Invalid request argument to search provider: ${reason}`,
  },
  invalid_indexer_input: {
    type: 'invalid_input',
    args: { reason: 'string' },
    message: ({ reason }) => `Invalid indexer input: ${reason}`,
  },

  // comment and reply errors
  comment_not_found: {
    type: 'resource_not_found',
    message: 'Comment not found.',
  },
  reply_not_found: {
    type: 'resource_not_found',
    message: 'Reply not found.',
  },
  comment_attachment_not_found: {
    type: 'resource_not_found',
    message: 'Comment attachment not found.',
  },
  comment_attachment_quota_exceeded: {
    type: 'quota_exceeded',
    message: 'You have exceeded the comment attachment size quota.',
  },
} satisfies Record<string, UserFriendlyErrorOptions>;
