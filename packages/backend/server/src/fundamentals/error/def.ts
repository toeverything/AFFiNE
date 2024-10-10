import { STATUS_CODES } from 'node:http';

import { HttpStatus, Logger } from '@nestjs/common';
import { capitalize } from 'lodash-es';

export type UserFriendlyErrorBaseType =
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
type ErrorArgs = Record<string, ErrorArgType | Record<string, ErrorArgType>>;

export type UserFriendlyErrorOptions = {
  type: UserFriendlyErrorBaseType;
  args?: ErrorArgs;
  message: string | ((args: any) => string);
};

const BaseTypeToHttpStatusMap: Record<UserFriendlyErrorBaseType, HttpStatus> = {
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
  }

  toJSON() {
    return {
      status: this.status,
      code: STATUS_CODES[this.status] ?? 'BAD REQUEST',
      type: this.type.toUpperCase(),
      name: this.name.toUpperCase(),
      message: this.message,
      data: this.data,
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
    ].join('\n');
  }

  log(context: string) {
    // ignore all user behavior error log
    if (this.type !== 'internal_server_error') {
      return;
    }

    new Logger(context).error(
      'Internal server error',
      this.cause ? ((this.cause as any).stack ?? this.cause) : this.stack
    );
  }
}

/**
 *
 * @ObjectType()
 * export class XXXDataType {
 *   @Field()
 *
 * }
 */
function generateErrorArgs(name: string, args: ErrorArgs) {
  const typeName = `${name}DataType`;
  const lines = [`@ObjectType()`, `class ${typeName} {`];
  Object.entries(args).forEach(([arg, fieldArgs]) => {
    if (typeof fieldArgs === 'object') {
      const subResult = generateErrorArgs(
        name + 'Field' + capitalize(arg),
        fieldArgs
      );
      lines.unshift(subResult.def);
      lines.push(
        `  @Field(() => ${subResult.name}) ${arg}!: ${subResult.name};`
      );
    } else {
      lines.push(`  @Field() ${arg}!: ${fieldArgs}`);
    }
  });

  lines.push('}');

  return { name: typeName, def: lines.join('\n') };
}

export function generateUserFriendlyErrors() {
  const output = [
    '/* eslint-disable */',
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
  too_many_request: {
    type: 'too_many_requests',
    message: 'Too many requests.',
  },
  not_found: {
    type: 'resource_not_found',
    message: 'Resource not found.',
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
    message: 'Wrong user email or password.',
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
  invalid_email: {
    type: 'invalid_input',
    message: 'An invalid email provided.',
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
  early_access_required: {
    type: 'action_forbidden',
    message: `You don't have early access permission. Visit https://community.affine.pro/c/insider-general/ for more information.`,
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
  space_not_found: {
    type: 'resource_not_found',
    args: { spaceId: 'string' },
    message: ({ spaceId }) => `Space ${spaceId} not found.`,
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
  cant_change_space_owner: {
    type: 'action_forbidden',
    message: 'You are not allowed to change the owner of a Space.',
  },
  doc_not_found: {
    type: 'resource_not_found',
    args: { spaceId: 'string', docId: 'string' },
    message: ({ spaceId, docId }) =>
      `Doc ${docId} under Space ${spaceId} not found.`,
  },
  doc_access_denied: {
    type: 'no_permission',
    args: { spaceId: 'string', docId: 'string' },
    message: ({ spaceId, docId }) =>
      `You do not have permission to access doc ${docId} under Space ${spaceId}.`,
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
  expect_to_publish_page: {
    type: 'invalid_input',
    message: 'Expected to publish a page, not a Space.',
  },
  expect_to_revoke_public_page: {
    type: 'invalid_input',
    message: 'Expected to revoke a public page, not a Space.',
  },
  page_is_not_public: {
    type: 'bad_request',
    message: 'Page is not public.',
  },
  failed_to_save_updates: {
    type: 'internal_server_error',
    message: 'Failed to store doc updates.',
  },
  failed_to_upsert_snapshot: {
    type: 'internal_server_error',
    message: 'Failed to store doc snapshot.',
  },

  // Subscription Errors
  failed_to_checkout: {
    type: 'internal_server_error',
    message: 'Failed to create checkout session.',
  },
  subscription_already_exists: {
    type: 'resource_already_exists',
    args: { plan: 'string' },
    message: ({ plan }) => `You have already subscribed to the ${plan} plan.`,
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

  // Copilot errors
  copilot_session_not_found: {
    type: 'resource_not_found',
    message: `Copilot session not found.`,
  },
  copilot_session_deleted: {
    type: 'action_forbidden',
    message: `Copilot session has been deleted.`,
  },
  no_copilot_provider_available: {
    type: 'internal_server_error',
    message: `No copilot provider available.`,
  },
  copilot_failed_to_generate_text: {
    type: 'internal_server_error',
    message: `Failed to generate text.`,
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
  copilot_provider_side_error: {
    type: 'internal_server_error',
    args: { provider: 'string', kind: 'string', message: 'string' },
    message: ({ provider, kind, message }) =>
      `Provider ${provider} failed with ${kind} error: ${message || 'unknown'}`,
  },

  // Quota & Limit errors
  blob_quota_exceeded: {
    type: 'quota_exceeded',
    message: 'You have exceeded your blob storage quota.',
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
  cannot_delete_own_account: {
    type: 'action_forbidden',
    message: 'Cannot delete own account.',
  },

  // captcha errors
  captcha_verification_failed: {
    type: 'bad_request',
    message: 'Captcha verification failed.',
  },
} satisfies Record<string, UserFriendlyErrorOptions>;
