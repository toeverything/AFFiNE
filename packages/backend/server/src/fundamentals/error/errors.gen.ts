/* eslint-disable */
// AUTO GENERATED FILE
import { createUnionType, Field, ObjectType, registerEnumType } from '@nestjs/graphql';

import { UserFriendlyError } from './def';

export class InternalServerError extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'internal_server_error', message);
  }
}

export class TooManyRequest extends UserFriendlyError {
  constructor(message?: string) {
    super('too_many_requests', 'too_many_request', message);
  }
}

export class NotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'not_found', message);
  }
}

export class UserNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'user_not_found', message);
  }
}

export class UserAvatarNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'user_avatar_not_found', message);
  }
}

export class EmailAlreadyUsed extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_already_exists', 'email_already_used', message);
  }
}

export class SameEmailProvided extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'same_email_provided', message);
  }
}

export class WrongSignInCredentials extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'wrong_sign_in_credentials', message);
  }
}
@ObjectType()
class UnknownOauthProviderDataType {
  @Field() name!: string
}

export class UnknownOauthProvider extends UserFriendlyError {
  constructor(args: UnknownOauthProviderDataType, message?: string | ((args: UnknownOauthProviderDataType) => string)) {
    super('invalid_input', 'unknown_oauth_provider', message, args);
  }
}

export class OauthStateExpired extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'oauth_state_expired', message);
  }
}

export class InvalidOauthCallbackState extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'invalid_oauth_callback_state', message);
  }
}
@ObjectType()
class MissingOauthQueryParameterDataType {
  @Field() name!: string
}

export class MissingOauthQueryParameter extends UserFriendlyError {
  constructor(args: MissingOauthQueryParameterDataType, message?: string | ((args: MissingOauthQueryParameterDataType) => string)) {
    super('bad_request', 'missing_oauth_query_parameter', message, args);
  }
}

export class OauthAccountAlreadyConnected extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'oauth_account_already_connected', message);
  }
}

export class InvalidEmail extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'invalid_email', message);
  }
}
@ObjectType()
class InvalidPasswordLengthDataType {
  @Field() min!: number
  @Field() max!: number
}

export class InvalidPasswordLength extends UserFriendlyError {
  constructor(args: InvalidPasswordLengthDataType, message?: string | ((args: InvalidPasswordLengthDataType) => string)) {
    super('invalid_input', 'invalid_password_length', message, args);
  }
}

export class PasswordRequired extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'password_required', message);
  }
}

export class WrongSignInMethod extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'wrong_sign_in_method', message);
  }
}

export class EarlyAccessRequired extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'early_access_required', message);
  }
}

export class SignUpForbidden extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'sign_up_forbidden', message);
  }
}

export class EmailTokenNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'email_token_not_found', message);
  }
}

export class InvalidEmailToken extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'invalid_email_token', message);
  }
}

export class LinkExpired extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'link_expired', message);
  }
}

export class AuthenticationRequired extends UserFriendlyError {
  constructor(message?: string) {
    super('authentication_required', 'authentication_required', message);
  }
}

export class ActionForbidden extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'action_forbidden', message);
  }
}

export class AccessDenied extends UserFriendlyError {
  constructor(message?: string) {
    super('no_permission', 'access_denied', message);
  }
}

export class EmailVerificationRequired extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'email_verification_required', message);
  }
}
@ObjectType()
class SpaceNotFoundDataType {
  @Field() spaceId!: string
}

export class SpaceNotFound extends UserFriendlyError {
  constructor(args: SpaceNotFoundDataType, message?: string | ((args: SpaceNotFoundDataType) => string)) {
    super('resource_not_found', 'space_not_found', message, args);
  }
}
@ObjectType()
class NotInSpaceDataType {
  @Field() spaceId!: string
}

export class NotInSpace extends UserFriendlyError {
  constructor(args: NotInSpaceDataType, message?: string | ((args: NotInSpaceDataType) => string)) {
    super('action_forbidden', 'not_in_space', message, args);
  }
}
@ObjectType()
class AlreadyInSpaceDataType {
  @Field() spaceId!: string
}

export class AlreadyInSpace extends UserFriendlyError {
  constructor(args: AlreadyInSpaceDataType, message?: string | ((args: AlreadyInSpaceDataType) => string)) {
    super('action_forbidden', 'already_in_space', message, args);
  }
}
@ObjectType()
class SpaceAccessDeniedDataType {
  @Field() spaceId!: string
}

export class SpaceAccessDenied extends UserFriendlyError {
  constructor(args: SpaceAccessDeniedDataType, message?: string | ((args: SpaceAccessDeniedDataType) => string)) {
    super('no_permission', 'space_access_denied', message, args);
  }
}
@ObjectType()
class SpaceOwnerNotFoundDataType {
  @Field() spaceId!: string
}

export class SpaceOwnerNotFound extends UserFriendlyError {
  constructor(args: SpaceOwnerNotFoundDataType, message?: string | ((args: SpaceOwnerNotFoundDataType) => string)) {
    super('internal_server_error', 'space_owner_not_found', message, args);
  }
}

export class CantChangeSpaceOwner extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'cant_change_space_owner', message);
  }
}
@ObjectType()
class DocNotFoundDataType {
  @Field() spaceId!: string
  @Field() docId!: string
}

export class DocNotFound extends UserFriendlyError {
  constructor(args: DocNotFoundDataType, message?: string | ((args: DocNotFoundDataType) => string)) {
    super('resource_not_found', 'doc_not_found', message, args);
  }
}
@ObjectType()
class DocAccessDeniedDataType {
  @Field() spaceId!: string
  @Field() docId!: string
}

export class DocAccessDenied extends UserFriendlyError {
  constructor(args: DocAccessDeniedDataType, message?: string | ((args: DocAccessDeniedDataType) => string)) {
    super('no_permission', 'doc_access_denied', message, args);
  }
}
@ObjectType()
class VersionRejectedDataType {
  @Field() version!: string
  @Field() serverVersion!: string
}

export class VersionRejected extends UserFriendlyError {
  constructor(args: VersionRejectedDataType, message?: string | ((args: VersionRejectedDataType) => string)) {
    super('action_forbidden', 'version_rejected', message, args);
  }
}
@ObjectType()
class InvalidHistoryTimestampDataType {
  @Field() timestamp!: string
}

export class InvalidHistoryTimestamp extends UserFriendlyError {
  constructor(args: InvalidHistoryTimestampDataType, message?: string | ((args: InvalidHistoryTimestampDataType) => string)) {
    super('invalid_input', 'invalid_history_timestamp', message, args);
  }
}
@ObjectType()
class DocHistoryNotFoundDataType {
  @Field() spaceId!: string
  @Field() docId!: string
  @Field() timestamp!: number
}

export class DocHistoryNotFound extends UserFriendlyError {
  constructor(args: DocHistoryNotFoundDataType, message?: string | ((args: DocHistoryNotFoundDataType) => string)) {
    super('resource_not_found', 'doc_history_not_found', message, args);
  }
}
@ObjectType()
class BlobNotFoundDataType {
  @Field() spaceId!: string
  @Field() blobId!: string
}

export class BlobNotFound extends UserFriendlyError {
  constructor(args: BlobNotFoundDataType, message?: string | ((args: BlobNotFoundDataType) => string)) {
    super('resource_not_found', 'blob_not_found', message, args);
  }
}

export class ExpectToPublishPage extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'expect_to_publish_page', message);
  }
}

export class ExpectToRevokePublicPage extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'expect_to_revoke_public_page', message);
  }
}

export class PageIsNotPublic extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'page_is_not_public', message);
  }
}

export class FailedToSaveUpdates extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'failed_to_save_updates', message);
  }
}

export class FailedToUpsertSnapshot extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'failed_to_upsert_snapshot', message);
  }
}

export class FailedToCheckout extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'failed_to_checkout', message);
  }
}
@ObjectType()
class SubscriptionAlreadyExistsDataType {
  @Field() plan!: string
}

export class SubscriptionAlreadyExists extends UserFriendlyError {
  constructor(args: SubscriptionAlreadyExistsDataType, message?: string | ((args: SubscriptionAlreadyExistsDataType) => string)) {
    super('resource_already_exists', 'subscription_already_exists', message, args);
  }
}
@ObjectType()
class SubscriptionNotExistsDataType {
  @Field() plan!: string
}

export class SubscriptionNotExists extends UserFriendlyError {
  constructor(args: SubscriptionNotExistsDataType, message?: string | ((args: SubscriptionNotExistsDataType) => string)) {
    super('resource_not_found', 'subscription_not_exists', message, args);
  }
}

export class SubscriptionHasBeenCanceled extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'subscription_has_been_canceled', message);
  }
}

export class SubscriptionExpired extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'subscription_expired', message);
  }
}
@ObjectType()
class SameSubscriptionRecurringDataType {
  @Field() recurring!: string
}

export class SameSubscriptionRecurring extends UserFriendlyError {
  constructor(args: SameSubscriptionRecurringDataType, message?: string | ((args: SameSubscriptionRecurringDataType) => string)) {
    super('bad_request', 'same_subscription_recurring', message, args);
  }
}

export class CustomerPortalCreateFailed extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'customer_portal_create_failed', message);
  }
}
@ObjectType()
class SubscriptionPlanNotFoundDataType {
  @Field() plan!: string
  @Field() recurring!: string
}

export class SubscriptionPlanNotFound extends UserFriendlyError {
  constructor(args: SubscriptionPlanNotFoundDataType, message?: string | ((args: SubscriptionPlanNotFoundDataType) => string)) {
    super('resource_not_found', 'subscription_plan_not_found', message, args);
  }
}

export class CantUpdateOnetimePaymentSubscription extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'cant_update_onetime_payment_subscription', message);
  }
}

export class CopilotSessionNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'copilot_session_not_found', message);
  }
}

export class CopilotSessionDeleted extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'copilot_session_deleted', message);
  }
}

export class NoCopilotProviderAvailable extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'no_copilot_provider_available', message);
  }
}

export class CopilotFailedToGenerateText extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'copilot_failed_to_generate_text', message);
  }
}

export class CopilotFailedToCreateMessage extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'copilot_failed_to_create_message', message);
  }
}

export class UnsplashIsNotConfigured extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'unsplash_is_not_configured', message);
  }
}

export class CopilotActionTaken extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'copilot_action_taken', message);
  }
}
@ObjectType()
class CopilotMessageNotFoundDataType {
  @Field() messageId!: string
}

export class CopilotMessageNotFound extends UserFriendlyError {
  constructor(args: CopilotMessageNotFoundDataType, message?: string | ((args: CopilotMessageNotFoundDataType) => string)) {
    super('resource_not_found', 'copilot_message_not_found', message, args);
  }
}
@ObjectType()
class CopilotPromptNotFoundDataType {
  @Field() name!: string
}

export class CopilotPromptNotFound extends UserFriendlyError {
  constructor(args: CopilotPromptNotFoundDataType, message?: string | ((args: CopilotPromptNotFoundDataType) => string)) {
    super('resource_not_found', 'copilot_prompt_not_found', message, args);
  }
}

export class CopilotPromptInvalid extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'copilot_prompt_invalid', message);
  }
}
@ObjectType()
class CopilotProviderSideErrorDataType {
  @Field() provider!: string
  @Field() kind!: string
  @Field() message!: string
}

export class CopilotProviderSideError extends UserFriendlyError {
  constructor(args: CopilotProviderSideErrorDataType, message?: string | ((args: CopilotProviderSideErrorDataType) => string)) {
    super('internal_server_error', 'copilot_provider_side_error', message, args);
  }
}

export class BlobQuotaExceeded extends UserFriendlyError {
  constructor(message?: string) {
    super('quota_exceeded', 'blob_quota_exceeded', message);
  }
}

export class MemberQuotaExceeded extends UserFriendlyError {
  constructor(message?: string) {
    super('quota_exceeded', 'member_quota_exceeded', message);
  }
}

export class CopilotQuotaExceeded extends UserFriendlyError {
  constructor(message?: string) {
    super('quota_exceeded', 'copilot_quota_exceeded', message);
  }
}
@ObjectType()
class RuntimeConfigNotFoundDataType {
  @Field() key!: string
}

export class RuntimeConfigNotFound extends UserFriendlyError {
  constructor(args: RuntimeConfigNotFoundDataType, message?: string | ((args: RuntimeConfigNotFoundDataType) => string)) {
    super('resource_not_found', 'runtime_config_not_found', message, args);
  }
}
@ObjectType()
class InvalidRuntimeConfigTypeDataType {
  @Field() key!: string
  @Field() want!: string
  @Field() get!: string
}

export class InvalidRuntimeConfigType extends UserFriendlyError {
  constructor(args: InvalidRuntimeConfigTypeDataType, message?: string | ((args: InvalidRuntimeConfigTypeDataType) => string)) {
    super('invalid_input', 'invalid_runtime_config_type', message, args);
  }
}

export class MailerServiceIsNotConfigured extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'mailer_service_is_not_configured', message);
  }
}

export class CannotDeleteAllAdminAccount extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'cannot_delete_all_admin_account', message);
  }
}

export class CannotDeleteOwnAccount extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'cannot_delete_own_account', message);
  }
}

export class CaptchaVerificationFailed extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'captcha_verification_failed', message);
  }
}
export enum ErrorNames {
  INTERNAL_SERVER_ERROR,
  TOO_MANY_REQUEST,
  NOT_FOUND,
  USER_NOT_FOUND,
  USER_AVATAR_NOT_FOUND,
  EMAIL_ALREADY_USED,
  SAME_EMAIL_PROVIDED,
  WRONG_SIGN_IN_CREDENTIALS,
  UNKNOWN_OAUTH_PROVIDER,
  OAUTH_STATE_EXPIRED,
  INVALID_OAUTH_CALLBACK_STATE,
  MISSING_OAUTH_QUERY_PARAMETER,
  OAUTH_ACCOUNT_ALREADY_CONNECTED,
  INVALID_EMAIL,
  INVALID_PASSWORD_LENGTH,
  PASSWORD_REQUIRED,
  WRONG_SIGN_IN_METHOD,
  EARLY_ACCESS_REQUIRED,
  SIGN_UP_FORBIDDEN,
  EMAIL_TOKEN_NOT_FOUND,
  INVALID_EMAIL_TOKEN,
  LINK_EXPIRED,
  AUTHENTICATION_REQUIRED,
  ACTION_FORBIDDEN,
  ACCESS_DENIED,
  EMAIL_VERIFICATION_REQUIRED,
  SPACE_NOT_FOUND,
  NOT_IN_SPACE,
  ALREADY_IN_SPACE,
  SPACE_ACCESS_DENIED,
  SPACE_OWNER_NOT_FOUND,
  CANT_CHANGE_SPACE_OWNER,
  DOC_NOT_FOUND,
  DOC_ACCESS_DENIED,
  VERSION_REJECTED,
  INVALID_HISTORY_TIMESTAMP,
  DOC_HISTORY_NOT_FOUND,
  BLOB_NOT_FOUND,
  EXPECT_TO_PUBLISH_PAGE,
  EXPECT_TO_REVOKE_PUBLIC_PAGE,
  PAGE_IS_NOT_PUBLIC,
  FAILED_TO_SAVE_UPDATES,
  FAILED_TO_UPSERT_SNAPSHOT,
  FAILED_TO_CHECKOUT,
  SUBSCRIPTION_ALREADY_EXISTS,
  SUBSCRIPTION_NOT_EXISTS,
  SUBSCRIPTION_HAS_BEEN_CANCELED,
  SUBSCRIPTION_EXPIRED,
  SAME_SUBSCRIPTION_RECURRING,
  CUSTOMER_PORTAL_CREATE_FAILED,
  SUBSCRIPTION_PLAN_NOT_FOUND,
  CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION,
  COPILOT_SESSION_NOT_FOUND,
  COPILOT_SESSION_DELETED,
  NO_COPILOT_PROVIDER_AVAILABLE,
  COPILOT_FAILED_TO_GENERATE_TEXT,
  COPILOT_FAILED_TO_CREATE_MESSAGE,
  UNSPLASH_IS_NOT_CONFIGURED,
  COPILOT_ACTION_TAKEN,
  COPILOT_MESSAGE_NOT_FOUND,
  COPILOT_PROMPT_NOT_FOUND,
  COPILOT_PROMPT_INVALID,
  COPILOT_PROVIDER_SIDE_ERROR,
  BLOB_QUOTA_EXCEEDED,
  MEMBER_QUOTA_EXCEEDED,
  COPILOT_QUOTA_EXCEEDED,
  RUNTIME_CONFIG_NOT_FOUND,
  INVALID_RUNTIME_CONFIG_TYPE,
  MAILER_SERVICE_IS_NOT_CONFIGURED,
  CANNOT_DELETE_ALL_ADMIN_ACCOUNT,
  CANNOT_DELETE_OWN_ACCOUNT,
  CAPTCHA_VERIFICATION_FAILED
}
registerEnumType(ErrorNames, {
  name: 'ErrorNames'
})

export const ErrorDataUnionType = createUnionType({
  name: 'ErrorDataUnion',
  types: () =>
    [UnknownOauthProviderDataType, MissingOauthQueryParameterDataType, InvalidPasswordLengthDataType, SpaceNotFoundDataType, NotInSpaceDataType, AlreadyInSpaceDataType, SpaceAccessDeniedDataType, SpaceOwnerNotFoundDataType, DocNotFoundDataType, DocAccessDeniedDataType, VersionRejectedDataType, InvalidHistoryTimestampDataType, DocHistoryNotFoundDataType, BlobNotFoundDataType, SubscriptionAlreadyExistsDataType, SubscriptionNotExistsDataType, SameSubscriptionRecurringDataType, SubscriptionPlanNotFoundDataType, CopilotMessageNotFoundDataType, CopilotPromptNotFoundDataType, CopilotProviderSideErrorDataType, RuntimeConfigNotFoundDataType, InvalidRuntimeConfigTypeDataType] as const,
});
