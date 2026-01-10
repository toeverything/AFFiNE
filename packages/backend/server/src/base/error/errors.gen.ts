/* oxlint-disable */
// AUTO GENERATED FILE
import { createUnionType, Field, ObjectType, registerEnumType } from '@nestjs/graphql';

import { UserFriendlyError } from './def';

export class InternalServerError extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'internal_server_error', message);
  }
}

export class NetworkError extends UserFriendlyError {
  constructor(message?: string) {
    super('network_error', 'network_error', message);
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

export class BadRequest extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'bad_request', message);
  }
}
@ObjectType()
class GraphqlBadRequestDataType {
  @Field() code!: string
  @Field() message!: string
}

export class GraphqlBadRequest extends UserFriendlyError {
  constructor(args: GraphqlBadRequestDataType, message?: string | ((args: GraphqlBadRequestDataType) => string)) {
    super('bad_request', 'graphql_bad_request', message, args);
  }
}
@ObjectType()
class HttpRequestErrorDataType {
  @Field() message!: string
}

export class HttpRequestError extends UserFriendlyError {
  constructor(args: HttpRequestErrorDataType, message?: string | ((args: HttpRequestErrorDataType) => string)) {
    super('bad_request', 'http_request_error', message, args);
  }
}

export class EmailServiceNotConfigured extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'email_service_not_configured', message);
  }
}
@ObjectType()
class QueryTooLongDataType {
  @Field() max!: number
}

export class QueryTooLong extends UserFriendlyError {
  constructor(args: QueryTooLongDataType, message?: string | ((args: QueryTooLongDataType) => string)) {
    super('invalid_input', 'query_too_long', message, args);
  }
}
@ObjectType()
class ValidationErrorDataType {
  @Field() errors!: string
}

export class ValidationError extends UserFriendlyError {
  constructor(args: ValidationErrorDataType, message?: string | ((args: ValidationErrorDataType) => string)) {
    super('invalid_input', 'validation_error', message, args);
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
@ObjectType()
class WrongSignInCredentialsDataType {
  @Field() email!: string
}

export class WrongSignInCredentials extends UserFriendlyError {
  constructor(args: WrongSignInCredentialsDataType, message?: string | ((args: WrongSignInCredentialsDataType) => string)) {
    super('invalid_input', 'wrong_sign_in_credentials', message, args);
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
class InvalidOauthCallbackCodeDataType {
  @Field() status!: number
  @Field() body!: string
}

export class InvalidOauthCallbackCode extends UserFriendlyError {
  constructor(args: InvalidOauthCallbackCodeDataType, message?: string | ((args: InvalidOauthCallbackCodeDataType) => string)) {
    super('bad_request', 'invalid_oauth_callback_code', message, args);
  }
}

export class InvalidAuthState extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'invalid_auth_state', message);
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
@ObjectType()
class InvalidOauthResponseDataType {
  @Field() reason!: string
}

export class InvalidOauthResponse extends UserFriendlyError {
  constructor(args: InvalidOauthResponseDataType, message?: string | ((args: InvalidOauthResponseDataType) => string)) {
    super('bad_request', 'invalid_oauth_response', message, args);
  }
}
@ObjectType()
class InvalidEmailDataType {
  @Field() email!: string
}

export class InvalidEmail extends UserFriendlyError {
  constructor(args: InvalidEmailDataType, message?: string | ((args: InvalidEmailDataType) => string)) {
    super('invalid_input', 'invalid_email', message, args);
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
class WorkspacePermissionNotFoundDataType {
  @Field() spaceId!: string
}

export class WorkspacePermissionNotFound extends UserFriendlyError {
  constructor(args: WorkspacePermissionNotFoundDataType, message?: string | ((args: WorkspacePermissionNotFoundDataType) => string)) {
    super('resource_not_found', 'workspace_permission_not_found', message, args);
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
class MemberNotFoundInSpaceDataType {
  @Field() spaceId!: string
}

export class MemberNotFoundInSpace extends UserFriendlyError {
  constructor(args: MemberNotFoundInSpaceDataType, message?: string | ((args: MemberNotFoundInSpaceDataType) => string)) {
    super('action_forbidden', 'member_not_found_in_space', message, args);
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
@ObjectType()
class SpaceShouldHaveOnlyOneOwnerDataType {
  @Field() spaceId!: string
}

export class SpaceShouldHaveOnlyOneOwner extends UserFriendlyError {
  constructor(args: SpaceShouldHaveOnlyOneOwnerDataType, message?: string | ((args: SpaceShouldHaveOnlyOneOwnerDataType) => string)) {
    super('invalid_input', 'space_should_have_only_one_owner', message, args);
  }
}

export class OwnerCanNotLeaveWorkspace extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'owner_can_not_leave_workspace', message);
  }
}

export class CanNotRevokeYourself extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'can_not_revoke_yourself', message);
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
class DocActionDeniedDataType {
  @Field() spaceId!: string
  @Field() docId!: string
  @Field() action!: string
}

export class DocActionDenied extends UserFriendlyError {
  constructor(args: DocActionDeniedDataType, message?: string | ((args: DocActionDeniedDataType) => string)) {
    super('no_permission', 'doc_action_denied', message, args);
  }
}
@ObjectType()
class DocUpdateBlockedDataType {
  @Field() spaceId!: string
  @Field() docId!: string
}

export class DocUpdateBlocked extends UserFriendlyError {
  constructor(args: DocUpdateBlockedDataType, message?: string | ((args: DocUpdateBlockedDataType) => string)) {
    super('action_forbidden', 'doc_update_blocked', message, args);
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

export class BlobInvalid extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'blob_invalid', message);
  }
}

export class ExpectToPublishDoc extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'expect_to_publish_doc', message);
  }
}

export class ExpectToRevokePublicDoc extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'expect_to_revoke_public_doc', message);
  }
}
@ObjectType()
class ExpectToGrantDocUserRolesDataType {
  @Field() spaceId!: string
  @Field() docId!: string
}

export class ExpectToGrantDocUserRoles extends UserFriendlyError {
  constructor(args: ExpectToGrantDocUserRolesDataType, message?: string | ((args: ExpectToGrantDocUserRolesDataType) => string)) {
    super('invalid_input', 'expect_to_grant_doc_user_roles', message, args);
  }
}
@ObjectType()
class ExpectToRevokeDocUserRolesDataType {
  @Field() spaceId!: string
  @Field() docId!: string
}

export class ExpectToRevokeDocUserRoles extends UserFriendlyError {
  constructor(args: ExpectToRevokeDocUserRolesDataType, message?: string | ((args: ExpectToRevokeDocUserRolesDataType) => string)) {
    super('invalid_input', 'expect_to_revoke_doc_user_roles', message, args);
  }
}
@ObjectType()
class ExpectToUpdateDocUserRoleDataType {
  @Field() spaceId!: string
  @Field() docId!: string
}

export class ExpectToUpdateDocUserRole extends UserFriendlyError {
  constructor(args: ExpectToUpdateDocUserRoleDataType, message?: string | ((args: ExpectToUpdateDocUserRoleDataType) => string)) {
    super('invalid_input', 'expect_to_update_doc_user_role', message, args);
  }
}

export class DocIsNotPublic extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'doc_is_not_public', message);
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

export class ActionForbiddenOnNonTeamWorkspace extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'action_forbidden_on_non_team_workspace', message);
  }
}

export class DocDefaultRoleCanNotBeOwner extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'doc_default_role_can_not_be_owner', message);
  }
}

export class CanNotBatchGrantDocOwnerPermissions extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'can_not_batch_grant_doc_owner_permissions', message);
  }
}

export class NewOwnerIsNotActiveMember extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'new_owner_is_not_active_member', message);
  }
}

export class InvalidInvitation extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'invalid_invitation', message);
  }
}
@ObjectType()
class NoMoreSeatDataType {
  @Field() spaceId!: string
}

export class NoMoreSeat extends UserFriendlyError {
  constructor(args: NoMoreSeatDataType, message?: string | ((args: NoMoreSeatDataType) => string)) {
    super('bad_request', 'no_more_seat', message, args);
  }
}
@ObjectType()
class UnsupportedSubscriptionPlanDataType {
  @Field() plan!: string
}

export class UnsupportedSubscriptionPlan extends UserFriendlyError {
  constructor(args: UnsupportedSubscriptionPlanDataType, message?: string | ((args: UnsupportedSubscriptionPlanDataType) => string)) {
    super('invalid_input', 'unsupported_subscription_plan', message, args);
  }
}

export class FailedToCheckout extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'failed_to_checkout', message);
  }
}

export class InvalidCheckoutParameters extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'invalid_checkout_parameters', message);
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

export class InvalidSubscriptionParameters extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'invalid_subscription_parameters', message);
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

export class SubscriptionHasNotBeenCanceled extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'subscription_has_not_been_canceled', message);
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

export class WorkspaceIdRequiredForTeamSubscription extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'workspace_id_required_for_team_subscription', message);
  }
}

export class WorkspaceIdRequiredToUpdateTeamSubscription extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'workspace_id_required_to_update_team_subscription', message);
  }
}

export class ManagedByAppStoreOrPlay extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'managed_by_app_store_or_play', message);
  }
}
@ObjectType()
class CalendarProviderRequestErrorDataType {
  @Field() status!: number
  @Field() message!: string
}

export class CalendarProviderRequestError extends UserFriendlyError {
  constructor(args: CalendarProviderRequestErrorDataType, message?: string | ((args: CalendarProviderRequestErrorDataType) => string)) {
    super('internal_server_error', 'calendar_provider_request_error', message, args);
  }
}

export class CopilotSessionNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'copilot_session_not_found', message);
  }
}

export class CopilotSessionInvalidInput extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'copilot_session_invalid_input', message);
  }
}

export class CopilotSessionDeleted extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'copilot_session_deleted', message);
  }
}
@ObjectType()
class NoCopilotProviderAvailableDataType {
  @Field() modelId!: string
}

export class NoCopilotProviderAvailable extends UserFriendlyError {
  constructor(args: NoCopilotProviderAvailableDataType, message?: string | ((args: NoCopilotProviderAvailableDataType) => string)) {
    super('internal_server_error', 'no_copilot_provider_available', message, args);
  }
}

export class CopilotFailedToGenerateText extends UserFriendlyError {
  constructor(message?: string) {
    super('internal_server_error', 'copilot_failed_to_generate_text', message);
  }
}
@ObjectType()
class CopilotFailedToGenerateEmbeddingDataType {
  @Field() provider!: string
  @Field() message!: string
}

export class CopilotFailedToGenerateEmbedding extends UserFriendlyError {
  constructor(args: CopilotFailedToGenerateEmbeddingDataType, message?: string | ((args: CopilotFailedToGenerateEmbeddingDataType) => string)) {
    super('internal_server_error', 'copilot_failed_to_generate_embedding', message, args);
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
class CopilotDocNotFoundDataType {
  @Field() docId!: string
}

export class CopilotDocNotFound extends UserFriendlyError {
  constructor(args: CopilotDocNotFoundDataType, message?: string | ((args: CopilotDocNotFoundDataType) => string)) {
    super('resource_not_found', 'copilot_doc_not_found', message, args);
  }
}

export class CopilotDocsNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'copilot_docs_not_found', message);
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
class CopilotProviderNotSupportedDataType {
  @Field() provider!: string
  @Field() kind!: string
}

export class CopilotProviderNotSupported extends UserFriendlyError {
  constructor(args: CopilotProviderNotSupportedDataType, message?: string | ((args: CopilotProviderNotSupportedDataType) => string)) {
    super('invalid_input', 'copilot_provider_not_supported', message, args);
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
@ObjectType()
class CopilotInvalidContextDataType {
  @Field() contextId!: string
}

export class CopilotInvalidContext extends UserFriendlyError {
  constructor(args: CopilotInvalidContextDataType, message?: string | ((args: CopilotInvalidContextDataType) => string)) {
    super('invalid_input', 'copilot_invalid_context', message, args);
  }
}
@ObjectType()
class CopilotContextFileNotSupportedDataType {
  @Field() fileName!: string
  @Field() message!: string
}

export class CopilotContextFileNotSupported extends UserFriendlyError {
  constructor(args: CopilotContextFileNotSupportedDataType, message?: string | ((args: CopilotContextFileNotSupportedDataType) => string)) {
    super('bad_request', 'copilot_context_file_not_supported', message, args);
  }
}
@ObjectType()
class CopilotFailedToModifyContextDataType {
  @Field() contextId!: string
  @Field() message!: string
}

export class CopilotFailedToModifyContext extends UserFriendlyError {
  constructor(args: CopilotFailedToModifyContextDataType, message?: string | ((args: CopilotFailedToModifyContextDataType) => string)) {
    super('internal_server_error', 'copilot_failed_to_modify_context', message, args);
  }
}
@ObjectType()
class CopilotFailedToMatchContextDataType {
  @Field() contextId!: string
  @Field() content!: string
  @Field() message!: string
}

export class CopilotFailedToMatchContext extends UserFriendlyError {
  constructor(args: CopilotFailedToMatchContextDataType, message?: string | ((args: CopilotFailedToMatchContextDataType) => string)) {
    super('internal_server_error', 'copilot_failed_to_match_context', message, args);
  }
}
@ObjectType()
class CopilotFailedToMatchGlobalContextDataType {
  @Field() workspaceId!: string
  @Field() content!: string
  @Field() message!: string
}

export class CopilotFailedToMatchGlobalContext extends UserFriendlyError {
  constructor(args: CopilotFailedToMatchGlobalContextDataType, message?: string | ((args: CopilotFailedToMatchGlobalContextDataType) => string)) {
    super('internal_server_error', 'copilot_failed_to_match_global_context', message, args);
  }
}

export class CopilotEmbeddingDisabled extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'copilot_embedding_disabled', message);
  }
}

export class CopilotEmbeddingUnavailable extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'copilot_embedding_unavailable', message);
  }
}

export class CopilotTranscriptionJobExists extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'copilot_transcription_job_exists', message);
  }
}

export class CopilotTranscriptionJobNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'copilot_transcription_job_not_found', message);
  }
}

export class CopilotTranscriptionAudioNotProvided extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'copilot_transcription_audio_not_provided', message);
  }
}
@ObjectType()
class CopilotFailedToAddWorkspaceFileEmbeddingDataType {
  @Field() message!: string
}

export class CopilotFailedToAddWorkspaceFileEmbedding extends UserFriendlyError {
  constructor(args: CopilotFailedToAddWorkspaceFileEmbeddingDataType, message?: string | ((args: CopilotFailedToAddWorkspaceFileEmbeddingDataType) => string)) {
    super('internal_server_error', 'copilot_failed_to_add_workspace_file_embedding', message, args);
  }
}

export class BlobQuotaExceeded extends UserFriendlyError {
  constructor(message?: string) {
    super('quota_exceeded', 'blob_quota_exceeded', message);
  }
}

export class StorageQuotaExceeded extends UserFriendlyError {
  constructor(message?: string) {
    super('quota_exceeded', 'storage_quota_exceeded', message);
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

export class CannotDeleteAccountWithOwnedTeamWorkspace extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'cannot_delete_account_with_owned_team_workspace', message);
  }
}

export class CaptchaVerificationFailed extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'captcha_verification_failed', message);
  }
}

export class InvalidLicenseSessionId extends UserFriendlyError {
  constructor(message?: string) {
    super('invalid_input', 'invalid_license_session_id', message);
  }
}

export class LicenseRevealed extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'license_revealed', message);
  }
}

export class WorkspaceLicenseAlreadyExists extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'workspace_license_already_exists', message);
  }
}

export class LicenseNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'license_not_found', message);
  }
}
@ObjectType()
class InvalidLicenseToActivateDataType {
  @Field() reason!: string
}

export class InvalidLicenseToActivate extends UserFriendlyError {
  constructor(args: InvalidLicenseToActivateDataType, message?: string | ((args: InvalidLicenseToActivateDataType) => string)) {
    super('bad_request', 'invalid_license_to_activate', message, args);
  }
}
@ObjectType()
class InvalidLicenseUpdateParamsDataType {
  @Field() reason!: string
}

export class InvalidLicenseUpdateParams extends UserFriendlyError {
  constructor(args: InvalidLicenseUpdateParamsDataType, message?: string | ((args: InvalidLicenseUpdateParamsDataType) => string)) {
    super('invalid_input', 'invalid_license_update_params', message, args);
  }
}

export class LicenseExpired extends UserFriendlyError {
  constructor(message?: string) {
    super('bad_request', 'license_expired', message);
  }
}
@ObjectType()
class UnsupportedClientVersionDataType {
  @Field() clientVersion!: string
  @Field() requiredVersion!: string
}

export class UnsupportedClientVersion extends UserFriendlyError {
  constructor(args: UnsupportedClientVersionDataType, message?: string | ((args: UnsupportedClientVersionDataType) => string)) {
    super('action_forbidden', 'unsupported_client_version', message, args);
  }
}

export class NotificationNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'notification_not_found', message);
  }
}
@ObjectType()
class MentionUserDocAccessDeniedDataType {
  @Field() docId!: string
}

export class MentionUserDocAccessDenied extends UserFriendlyError {
  constructor(args: MentionUserDocAccessDeniedDataType, message?: string | ((args: MentionUserDocAccessDeniedDataType) => string)) {
    super('no_permission', 'mention_user_doc_access_denied', message, args);
  }
}

export class MentionUserOneselfDenied extends UserFriendlyError {
  constructor(message?: string) {
    super('action_forbidden', 'mention_user_oneself_denied', message);
  }
}
@ObjectType()
class InvalidAppConfigDataType {
  @Field() module!: string
  @Field() key!: string
  @Field() hint!: string
}

export class InvalidAppConfig extends UserFriendlyError {
  constructor(args: InvalidAppConfigDataType, message?: string | ((args: InvalidAppConfigDataType) => string)) {
    super('invalid_input', 'invalid_app_config', message, args);
  }
}
@ObjectType()
class InvalidAppConfigInputDataType {
  @Field() message!: string
}

export class InvalidAppConfigInput extends UserFriendlyError {
  constructor(args: InvalidAppConfigInputDataType, message?: string | ((args: InvalidAppConfigInputDataType) => string)) {
    super('invalid_input', 'invalid_app_config_input', message, args);
  }
}

export class SearchProviderNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'search_provider_not_found', message);
  }
}
@ObjectType()
class InvalidSearchProviderRequestDataType {
  @Field() reason!: string
  @Field() type!: string
}

export class InvalidSearchProviderRequest extends UserFriendlyError {
  constructor(args: InvalidSearchProviderRequestDataType, message?: string | ((args: InvalidSearchProviderRequestDataType) => string)) {
    super('invalid_input', 'invalid_search_provider_request', message, args);
  }
}
@ObjectType()
class InvalidIndexerInputDataType {
  @Field() reason!: string
}

export class InvalidIndexerInput extends UserFriendlyError {
  constructor(args: InvalidIndexerInputDataType, message?: string | ((args: InvalidIndexerInputDataType) => string)) {
    super('invalid_input', 'invalid_indexer_input', message, args);
  }
}

export class CommentNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'comment_not_found', message);
  }
}

export class ReplyNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'reply_not_found', message);
  }
}

export class CommentAttachmentNotFound extends UserFriendlyError {
  constructor(message?: string) {
    super('resource_not_found', 'comment_attachment_not_found', message);
  }
}

export class CommentAttachmentQuotaExceeded extends UserFriendlyError {
  constructor(message?: string) {
    super('quota_exceeded', 'comment_attachment_quota_exceeded', message);
  }
}
export enum ErrorNames {
  INTERNAL_SERVER_ERROR,
  NETWORK_ERROR,
  TOO_MANY_REQUEST,
  NOT_FOUND,
  BAD_REQUEST,
  GRAPHQL_BAD_REQUEST,
  HTTP_REQUEST_ERROR,
  EMAIL_SERVICE_NOT_CONFIGURED,
  QUERY_TOO_LONG,
  VALIDATION_ERROR,
  USER_NOT_FOUND,
  USER_AVATAR_NOT_FOUND,
  EMAIL_ALREADY_USED,
  SAME_EMAIL_PROVIDED,
  WRONG_SIGN_IN_CREDENTIALS,
  UNKNOWN_OAUTH_PROVIDER,
  OAUTH_STATE_EXPIRED,
  INVALID_OAUTH_CALLBACK_STATE,
  INVALID_OAUTH_CALLBACK_CODE,
  INVALID_AUTH_STATE,
  MISSING_OAUTH_QUERY_PARAMETER,
  OAUTH_ACCOUNT_ALREADY_CONNECTED,
  INVALID_OAUTH_RESPONSE,
  INVALID_EMAIL,
  INVALID_PASSWORD_LENGTH,
  PASSWORD_REQUIRED,
  WRONG_SIGN_IN_METHOD,
  SIGN_UP_FORBIDDEN,
  EMAIL_TOKEN_NOT_FOUND,
  INVALID_EMAIL_TOKEN,
  LINK_EXPIRED,
  AUTHENTICATION_REQUIRED,
  ACTION_FORBIDDEN,
  ACCESS_DENIED,
  EMAIL_VERIFICATION_REQUIRED,
  WORKSPACE_PERMISSION_NOT_FOUND,
  SPACE_NOT_FOUND,
  MEMBER_NOT_FOUND_IN_SPACE,
  NOT_IN_SPACE,
  ALREADY_IN_SPACE,
  SPACE_ACCESS_DENIED,
  SPACE_OWNER_NOT_FOUND,
  SPACE_SHOULD_HAVE_ONLY_ONE_OWNER,
  OWNER_CAN_NOT_LEAVE_WORKSPACE,
  CAN_NOT_REVOKE_YOURSELF,
  DOC_NOT_FOUND,
  DOC_ACTION_DENIED,
  DOC_UPDATE_BLOCKED,
  VERSION_REJECTED,
  INVALID_HISTORY_TIMESTAMP,
  DOC_HISTORY_NOT_FOUND,
  BLOB_NOT_FOUND,
  BLOB_INVALID,
  EXPECT_TO_PUBLISH_DOC,
  EXPECT_TO_REVOKE_PUBLIC_DOC,
  EXPECT_TO_GRANT_DOC_USER_ROLES,
  EXPECT_TO_REVOKE_DOC_USER_ROLES,
  EXPECT_TO_UPDATE_DOC_USER_ROLE,
  DOC_IS_NOT_PUBLIC,
  FAILED_TO_SAVE_UPDATES,
  FAILED_TO_UPSERT_SNAPSHOT,
  ACTION_FORBIDDEN_ON_NON_TEAM_WORKSPACE,
  DOC_DEFAULT_ROLE_CAN_NOT_BE_OWNER,
  CAN_NOT_BATCH_GRANT_DOC_OWNER_PERMISSIONS,
  NEW_OWNER_IS_NOT_ACTIVE_MEMBER,
  INVALID_INVITATION,
  NO_MORE_SEAT,
  UNSUPPORTED_SUBSCRIPTION_PLAN,
  FAILED_TO_CHECKOUT,
  INVALID_CHECKOUT_PARAMETERS,
  SUBSCRIPTION_ALREADY_EXISTS,
  INVALID_SUBSCRIPTION_PARAMETERS,
  SUBSCRIPTION_NOT_EXISTS,
  SUBSCRIPTION_HAS_BEEN_CANCELED,
  SUBSCRIPTION_HAS_NOT_BEEN_CANCELED,
  SUBSCRIPTION_EXPIRED,
  SAME_SUBSCRIPTION_RECURRING,
  CUSTOMER_PORTAL_CREATE_FAILED,
  SUBSCRIPTION_PLAN_NOT_FOUND,
  CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION,
  WORKSPACE_ID_REQUIRED_FOR_TEAM_SUBSCRIPTION,
  WORKSPACE_ID_REQUIRED_TO_UPDATE_TEAM_SUBSCRIPTION,
  MANAGED_BY_APP_STORE_OR_PLAY,
  CALENDAR_PROVIDER_REQUEST_ERROR,
  COPILOT_SESSION_NOT_FOUND,
  COPILOT_SESSION_INVALID_INPUT,
  COPILOT_SESSION_DELETED,
  NO_COPILOT_PROVIDER_AVAILABLE,
  COPILOT_FAILED_TO_GENERATE_TEXT,
  COPILOT_FAILED_TO_GENERATE_EMBEDDING,
  COPILOT_FAILED_TO_CREATE_MESSAGE,
  UNSPLASH_IS_NOT_CONFIGURED,
  COPILOT_ACTION_TAKEN,
  COPILOT_DOC_NOT_FOUND,
  COPILOT_DOCS_NOT_FOUND,
  COPILOT_MESSAGE_NOT_FOUND,
  COPILOT_PROMPT_NOT_FOUND,
  COPILOT_PROMPT_INVALID,
  COPILOT_PROVIDER_NOT_SUPPORTED,
  COPILOT_PROVIDER_SIDE_ERROR,
  COPILOT_INVALID_CONTEXT,
  COPILOT_CONTEXT_FILE_NOT_SUPPORTED,
  COPILOT_FAILED_TO_MODIFY_CONTEXT,
  COPILOT_FAILED_TO_MATCH_CONTEXT,
  COPILOT_FAILED_TO_MATCH_GLOBAL_CONTEXT,
  COPILOT_EMBEDDING_DISABLED,
  COPILOT_EMBEDDING_UNAVAILABLE,
  COPILOT_TRANSCRIPTION_JOB_EXISTS,
  COPILOT_TRANSCRIPTION_JOB_NOT_FOUND,
  COPILOT_TRANSCRIPTION_AUDIO_NOT_PROVIDED,
  COPILOT_FAILED_TO_ADD_WORKSPACE_FILE_EMBEDDING,
  BLOB_QUOTA_EXCEEDED,
  STORAGE_QUOTA_EXCEEDED,
  MEMBER_QUOTA_EXCEEDED,
  COPILOT_QUOTA_EXCEEDED,
  RUNTIME_CONFIG_NOT_FOUND,
  INVALID_RUNTIME_CONFIG_TYPE,
  MAILER_SERVICE_IS_NOT_CONFIGURED,
  CANNOT_DELETE_ALL_ADMIN_ACCOUNT,
  CANNOT_DELETE_OWN_ACCOUNT,
  CANNOT_DELETE_ACCOUNT_WITH_OWNED_TEAM_WORKSPACE,
  CAPTCHA_VERIFICATION_FAILED,
  INVALID_LICENSE_SESSION_ID,
  LICENSE_REVEALED,
  WORKSPACE_LICENSE_ALREADY_EXISTS,
  LICENSE_NOT_FOUND,
  INVALID_LICENSE_TO_ACTIVATE,
  INVALID_LICENSE_UPDATE_PARAMS,
  LICENSE_EXPIRED,
  UNSUPPORTED_CLIENT_VERSION,
  NOTIFICATION_NOT_FOUND,
  MENTION_USER_DOC_ACCESS_DENIED,
  MENTION_USER_ONESELF_DENIED,
  INVALID_APP_CONFIG,
  INVALID_APP_CONFIG_INPUT,
  SEARCH_PROVIDER_NOT_FOUND,
  INVALID_SEARCH_PROVIDER_REQUEST,
  INVALID_INDEXER_INPUT,
  COMMENT_NOT_FOUND,
  REPLY_NOT_FOUND,
  COMMENT_ATTACHMENT_NOT_FOUND,
  COMMENT_ATTACHMENT_QUOTA_EXCEEDED
}
registerEnumType(ErrorNames, {
  name: 'ErrorNames'
})

export const ErrorDataUnionType = createUnionType({
  name: 'ErrorDataUnion',
  types: () =>
    [GraphqlBadRequestDataType, HttpRequestErrorDataType, QueryTooLongDataType, ValidationErrorDataType, WrongSignInCredentialsDataType, UnknownOauthProviderDataType, InvalidOauthCallbackCodeDataType, MissingOauthQueryParameterDataType, InvalidOauthResponseDataType, InvalidEmailDataType, InvalidPasswordLengthDataType, WorkspacePermissionNotFoundDataType, SpaceNotFoundDataType, MemberNotFoundInSpaceDataType, NotInSpaceDataType, AlreadyInSpaceDataType, SpaceAccessDeniedDataType, SpaceOwnerNotFoundDataType, SpaceShouldHaveOnlyOneOwnerDataType, DocNotFoundDataType, DocActionDeniedDataType, DocUpdateBlockedDataType, VersionRejectedDataType, InvalidHistoryTimestampDataType, DocHistoryNotFoundDataType, BlobNotFoundDataType, ExpectToGrantDocUserRolesDataType, ExpectToRevokeDocUserRolesDataType, ExpectToUpdateDocUserRoleDataType, NoMoreSeatDataType, UnsupportedSubscriptionPlanDataType, SubscriptionAlreadyExistsDataType, SubscriptionNotExistsDataType, SameSubscriptionRecurringDataType, SubscriptionPlanNotFoundDataType, CalendarProviderRequestErrorDataType, NoCopilotProviderAvailableDataType, CopilotFailedToGenerateEmbeddingDataType, CopilotDocNotFoundDataType, CopilotMessageNotFoundDataType, CopilotPromptNotFoundDataType, CopilotProviderNotSupportedDataType, CopilotProviderSideErrorDataType, CopilotInvalidContextDataType, CopilotContextFileNotSupportedDataType, CopilotFailedToModifyContextDataType, CopilotFailedToMatchContextDataType, CopilotFailedToMatchGlobalContextDataType, CopilotFailedToAddWorkspaceFileEmbeddingDataType, RuntimeConfigNotFoundDataType, InvalidRuntimeConfigTypeDataType, InvalidLicenseToActivateDataType, InvalidLicenseUpdateParamsDataType, UnsupportedClientVersionDataType, MentionUserDocAccessDeniedDataType, InvalidAppConfigDataType, InvalidAppConfigInputDataType, InvalidSearchProviderRequestDataType, InvalidIndexerInputDataType] as const,
});
