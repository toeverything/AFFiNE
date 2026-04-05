// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public protocol SelectionSet: ApolloAPI.SelectionSet & ApolloAPI.RootSelectionSet
where Schema == AffineGraphQL.SchemaMetadata {}

public protocol InlineFragment: ApolloAPI.SelectionSet & ApolloAPI.InlineFragment
where Schema == AffineGraphQL.SchemaMetadata {}

public protocol MutableSelectionSet: ApolloAPI.MutableRootSelectionSet
where Schema == AffineGraphQL.SchemaMetadata {}

public protocol MutableInlineFragment: ApolloAPI.MutableSelectionSet & ApolloAPI.InlineFragment
where Schema == AffineGraphQL.SchemaMetadata {}

public enum SchemaMetadata: ApolloAPI.SchemaMetadata {
  public static let configuration: any ApolloAPI.SchemaConfiguration.Type = SchemaConfiguration.self

  private static let objectTypeMap: [String: ApolloAPI.Object] = [
    "AdminAllSharedLink": AffineGraphQL.Objects.AdminAllSharedLink,
    "AdminAllSharedLinkEdge": AffineGraphQL.Objects.AdminAllSharedLinkEdge,
    "AdminDashboard": AffineGraphQL.Objects.AdminDashboard,
    "AdminDashboardMinutePoint": AffineGraphQL.Objects.AdminDashboardMinutePoint,
    "AdminDashboardValueDayPoint": AffineGraphQL.Objects.AdminDashboardValueDayPoint,
    "AdminSharedLinkTopItem": AffineGraphQL.Objects.AdminSharedLinkTopItem,
    "AdminWorkspace": AffineGraphQL.Objects.AdminWorkspace,
    "AdminWorkspaceMember": AffineGraphQL.Objects.AdminWorkspaceMember,
    "AdminWorkspaceSharedLink": AffineGraphQL.Objects.AdminWorkspaceSharedLink,
    "AggregateBucketHitsObjectType": AffineGraphQL.Objects.AggregateBucketHitsObjectType,
    "AggregateBucketObjectType": AffineGraphQL.Objects.AggregateBucketObjectType,
    "AggregateResultObjectType": AffineGraphQL.Objects.AggregateResultObjectType,
    "AppConfigValidateResult": AffineGraphQL.Objects.AppConfigValidateResult,
    "AudioSliceManifestItemType": AffineGraphQL.Objects.AudioSliceManifestItemType,
    "BlobUploadInit": AffineGraphQL.Objects.BlobUploadInit,
    "BlobUploadPart": AffineGraphQL.Objects.BlobUploadPart,
    "BlobUploadedPart": AffineGraphQL.Objects.BlobUploadedPart,
    "CalendarAccountObjectType": AffineGraphQL.Objects.CalendarAccountObjectType,
    "CalendarCalDAVProviderPresetObjectType": AffineGraphQL.Objects.CalendarCalDAVProviderPresetObjectType,
    "CalendarEventObjectType": AffineGraphQL.Objects.CalendarEventObjectType,
    "CalendarSubscriptionObjectType": AffineGraphQL.Objects.CalendarSubscriptionObjectType,
    "ChatMessage": AffineGraphQL.Objects.ChatMessage,
    "CommentChangeObjectType": AffineGraphQL.Objects.CommentChangeObjectType,
    "CommentChangeObjectTypeEdge": AffineGraphQL.Objects.CommentChangeObjectTypeEdge,
    "CommentObjectType": AffineGraphQL.Objects.CommentObjectType,
    "CommentObjectTypeEdge": AffineGraphQL.Objects.CommentObjectTypeEdge,
    "ContextMatchedDocChunk": AffineGraphQL.Objects.ContextMatchedDocChunk,
    "ContextMatchedFileChunk": AffineGraphQL.Objects.ContextMatchedFileChunk,
    "ContextWorkspaceEmbeddingStatus": AffineGraphQL.Objects.ContextWorkspaceEmbeddingStatus,
    "Copilot": AffineGraphQL.Objects.Copilot,
    "CopilotContext": AffineGraphQL.Objects.CopilotContext,
    "CopilotContextBlob": AffineGraphQL.Objects.CopilotContextBlob,
    "CopilotContextCategory": AffineGraphQL.Objects.CopilotContextCategory,
    "CopilotContextDoc": AffineGraphQL.Objects.CopilotContextDoc,
    "CopilotContextFile": AffineGraphQL.Objects.CopilotContextFile,
    "CopilotHistories": AffineGraphQL.Objects.CopilotHistories,
    "CopilotHistoriesTypeEdge": AffineGraphQL.Objects.CopilotHistoriesTypeEdge,
    "CopilotModelType": AffineGraphQL.Objects.CopilotModelType,
    "CopilotModelsType": AffineGraphQL.Objects.CopilotModelsType,
    "CopilotQuota": AffineGraphQL.Objects.CopilotQuota,
    "CopilotWorkspaceConfig": AffineGraphQL.Objects.CopilotWorkspaceConfig,
    "CopilotWorkspaceFile": AffineGraphQL.Objects.CopilotWorkspaceFile,
    "CopilotWorkspaceFileTypeEdge": AffineGraphQL.Objects.CopilotWorkspaceFileTypeEdge,
    "CopilotWorkspaceIgnoredDoc": AffineGraphQL.Objects.CopilotWorkspaceIgnoredDoc,
    "CopilotWorkspaceIgnoredDocTypeEdge": AffineGraphQL.Objects.CopilotWorkspaceIgnoredDocTypeEdge,
    "CredentialsRequirementType": AffineGraphQL.Objects.CredentialsRequirementType,
    "DeleteAccount": AffineGraphQL.Objects.DeleteAccount,
    "DocHistoryType": AffineGraphQL.Objects.DocHistoryType,
    "DocMemberLastAccess": AffineGraphQL.Objects.DocMemberLastAccess,
    "DocMemberLastAccessEdge": AffineGraphQL.Objects.DocMemberLastAccessEdge,
    "DocPageAnalytics": AffineGraphQL.Objects.DocPageAnalytics,
    "DocPageAnalyticsPoint": AffineGraphQL.Objects.DocPageAnalyticsPoint,
    "DocPageAnalyticsSummary": AffineGraphQL.Objects.DocPageAnalyticsSummary,
    "DocPermissions": AffineGraphQL.Objects.DocPermissions,
    "DocType": AffineGraphQL.Objects.DocType,
    "DocTypeEdge": AffineGraphQL.Objects.DocTypeEdge,
    "EditorType": AffineGraphQL.Objects.EditorType,
    "GrantedDocUserType": AffineGraphQL.Objects.GrantedDocUserType,
    "GrantedDocUserTypeEdge": AffineGraphQL.Objects.GrantedDocUserTypeEdge,
    "InvitationType": AffineGraphQL.Objects.InvitationType,
    "InvitationWorkspaceType": AffineGraphQL.Objects.InvitationWorkspaceType,
    "InviteLink": AffineGraphQL.Objects.InviteLink,
    "InviteResult": AffineGraphQL.Objects.InviteResult,
    "InviteUserType": AffineGraphQL.Objects.InviteUserType,
    "InvoiceType": AffineGraphQL.Objects.InvoiceType,
    "License": AffineGraphQL.Objects.License,
    "LimitedUserType": AffineGraphQL.Objects.LimitedUserType,
    "ListedBlob": AffineGraphQL.Objects.ListedBlob,
    "MeetingActionItemType": AffineGraphQL.Objects.MeetingActionItemType,
    "MeetingSummaryV2Type": AffineGraphQL.Objects.MeetingSummaryV2Type,
    "Mutation": AffineGraphQL.Objects.Mutation,
    "NormalizedTranscriptSegmentType": AffineGraphQL.Objects.NormalizedTranscriptSegmentType,
    "NotificationObjectType": AffineGraphQL.Objects.NotificationObjectType,
    "NotificationObjectTypeEdge": AffineGraphQL.Objects.NotificationObjectTypeEdge,
    "PageInfo": AffineGraphQL.Objects.PageInfo,
    "PaginatedAdminAllSharedLink": AffineGraphQL.Objects.PaginatedAdminAllSharedLink,
    "PaginatedCommentChangeObjectType": AffineGraphQL.Objects.PaginatedCommentChangeObjectType,
    "PaginatedCommentObjectType": AffineGraphQL.Objects.PaginatedCommentObjectType,
    "PaginatedCopilotHistoriesType": AffineGraphQL.Objects.PaginatedCopilotHistoriesType,
    "PaginatedCopilotWorkspaceFileType": AffineGraphQL.Objects.PaginatedCopilotWorkspaceFileType,
    "PaginatedDocMemberLastAccess": AffineGraphQL.Objects.PaginatedDocMemberLastAccess,
    "PaginatedDocType": AffineGraphQL.Objects.PaginatedDocType,
    "PaginatedGrantedDocUserType": AffineGraphQL.Objects.PaginatedGrantedDocUserType,
    "PaginatedIgnoredDocsType": AffineGraphQL.Objects.PaginatedIgnoredDocsType,
    "PaginatedNotificationObjectType": AffineGraphQL.Objects.PaginatedNotificationObjectType,
    "PasswordLimitsType": AffineGraphQL.Objects.PasswordLimitsType,
    "PublicUserType": AffineGraphQL.Objects.PublicUserType,
    "Query": AffineGraphQL.Objects.Query,
    "ReleaseVersionType": AffineGraphQL.Objects.ReleaseVersionType,
    "RemoveAvatar": AffineGraphQL.Objects.RemoveAvatar,
    "ReplyObjectType": AffineGraphQL.Objects.ReplyObjectType,
    "RevealedAccessToken": AffineGraphQL.Objects.RevealedAccessToken,
    "SearchDocObjectType": AffineGraphQL.Objects.SearchDocObjectType,
    "SearchNodeObjectType": AffineGraphQL.Objects.SearchNodeObjectType,
    "SearchResultObjectType": AffineGraphQL.Objects.SearchResultObjectType,
    "SearchResultPagination": AffineGraphQL.Objects.SearchResultPagination,
    "ServerConfigType": AffineGraphQL.Objects.ServerConfigType,
    "StreamObject": AffineGraphQL.Objects.StreamObject,
    "SubscriptionPrice": AffineGraphQL.Objects.SubscriptionPrice,
    "SubscriptionType": AffineGraphQL.Objects.SubscriptionType,
    "TimeWindow": AffineGraphQL.Objects.TimeWindow,
    "TranscriptionItemType": AffineGraphQL.Objects.TranscriptionItemType,
    "TranscriptionQualityType": AffineGraphQL.Objects.TranscriptionQualityType,
    "TranscriptionResultType": AffineGraphQL.Objects.TranscriptionResultType,
    "TranscriptionSourceAudioType": AffineGraphQL.Objects.TranscriptionSourceAudioType,
    "UserImportFailedType": AffineGraphQL.Objects.UserImportFailedType,
    "UserQuotaHumanReadableType": AffineGraphQL.Objects.UserQuotaHumanReadableType,
    "UserQuotaType": AffineGraphQL.Objects.UserQuotaType,
    "UserQuotaUsageType": AffineGraphQL.Objects.UserQuotaUsageType,
    "UserSettingsType": AffineGraphQL.Objects.UserSettingsType,
    "UserType": AffineGraphQL.Objects.UserType,
    "WorkspaceCalendarItemObjectType": AffineGraphQL.Objects.WorkspaceCalendarItemObjectType,
    "WorkspaceCalendarObjectType": AffineGraphQL.Objects.WorkspaceCalendarObjectType,
    "WorkspaceDocMeta": AffineGraphQL.Objects.WorkspaceDocMeta,
    "WorkspacePermissions": AffineGraphQL.Objects.WorkspacePermissions,
    "WorkspaceQuotaHumanReadableType": AffineGraphQL.Objects.WorkspaceQuotaHumanReadableType,
    "WorkspaceQuotaType": AffineGraphQL.Objects.WorkspaceQuotaType,
    "WorkspaceRolePermissions": AffineGraphQL.Objects.WorkspaceRolePermissions,
    "WorkspaceType": AffineGraphQL.Objects.WorkspaceType,
    "WorkspaceUserType": AffineGraphQL.Objects.WorkspaceUserType,
    "tokenType": AffineGraphQL.Objects.TokenType
  ]

  public static func objectType(forTypename typename: String) -> ApolloAPI.Object? {
    objectTypeMap[typename]
  }
}

public enum Objects {}
public enum Interfaces {}
public enum Unions {}
