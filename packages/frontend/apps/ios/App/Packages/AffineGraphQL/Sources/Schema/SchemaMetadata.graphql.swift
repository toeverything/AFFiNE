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
    "AdminLicensePreview": AffineGraphQL.Objects.AdminLicensePreview,
    "AdminMailDeliveryAnalytics": AffineGraphQL.Objects.AdminMailDeliveryAnalytics,
    "AdminMailDeliveryPoint": AffineGraphQL.Objects.AdminMailDeliveryPoint,
    "AdminMailDeliverySeries": AffineGraphQL.Objects.AdminMailDeliverySeries,
    "AdminMailDeliverySummary": AffineGraphQL.Objects.AdminMailDeliverySummary,
    "AdminSharedLinkTopItem": AffineGraphQL.Objects.AdminSharedLinkTopItem,
    "AdminWorkspace": AffineGraphQL.Objects.AdminWorkspace,
    "AdminWorkspaceMember": AffineGraphQL.Objects.AdminWorkspaceMember,
    "AdminWorkspaceSharedLink": AffineGraphQL.Objects.AdminWorkspaceSharedLink,
    "AggregateBucketHitsObjectType": AffineGraphQL.Objects.AggregateBucketHitsObjectType,
    "AggregateBucketObjectType": AffineGraphQL.Objects.AggregateBucketObjectType,
    "AggregateResultObjectType": AffineGraphQL.Objects.AggregateResultObjectType,
    "AppConfigValidateResult": AffineGraphQL.Objects.AppConfigValidateResult,
    "AudioSliceManifestItemType": AffineGraphQL.Objects.AudioSliceManifestItemType,
    "AuthSigningKeyType": AffineGraphQL.Objects.AuthSigningKeyType,
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
    "Copilot": AffineGraphQL.Objects.Copilot,
    "CopilotHistories": AffineGraphQL.Objects.CopilotHistories,
    "CopilotHistoriesTypeEdge": AffineGraphQL.Objects.CopilotHistoriesTypeEdge,
    "CopilotQuota": AffineGraphQL.Objects.CopilotQuota,
    "CopilotRouteOptions": AffineGraphQL.Objects.CopilotRouteOptions,
    "CopilotRouteTarget": AffineGraphQL.Objects.CopilotRouteTarget,
    "CopilotWorkspaceArtifact": AffineGraphQL.Objects.CopilotWorkspaceArtifact,
    "CopilotWorkspaceArtifactTypeEdge": AffineGraphQL.Objects.CopilotWorkspaceArtifactTypeEdge,
    "CopilotWorkspaceConfig": AffineGraphQL.Objects.CopilotWorkspaceConfig,
    "CopilotWorkspaceIgnoredDoc": AffineGraphQL.Objects.CopilotWorkspaceIgnoredDoc,
    "CopilotWorkspaceIgnoredDocTypeEdge": AffineGraphQL.Objects.CopilotWorkspaceIgnoredDocTypeEdge,
    "CreateWorkspaceByokLocalLeaseResultType": AffineGraphQL.Objects.CreateWorkspaceByokLocalLeaseResultType,
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
    "InvitationType": AffineGraphQL.Objects.InvitationType,
    "InvitationWorkspaceType": AffineGraphQL.Objects.InvitationWorkspaceType,
    "InviteLink": AffineGraphQL.Objects.InviteLink,
    "InviteResult": AffineGraphQL.Objects.InviteResult,
    "InvoiceType": AffineGraphQL.Objects.InvoiceType,
    "License": AffineGraphQL.Objects.License,
    "LimitedUserType": AffineGraphQL.Objects.LimitedUserType,
    "ListedBlob": AffineGraphQL.Objects.ListedBlob,
    "McpCredentialType": AffineGraphQL.Objects.McpCredentialType,
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
    "PaginatedCopilotWorkspaceArtifactType": AffineGraphQL.Objects.PaginatedCopilotWorkspaceArtifactType,
    "PaginatedDocMemberLastAccess": AffineGraphQL.Objects.PaginatedDocMemberLastAccess,
    "PaginatedDocType": AffineGraphQL.Objects.PaginatedDocType,
    "PaginatedIgnoredDocsType": AffineGraphQL.Objects.PaginatedIgnoredDocsType,
    "PaginatedNotificationObjectType": AffineGraphQL.Objects.PaginatedNotificationObjectType,
    "PasswordLimitsType": AffineGraphQL.Objects.PasswordLimitsType,
    "PublicUserType": AffineGraphQL.Objects.PublicUserType,
    "Query": AffineGraphQL.Objects.Query,
    "ReleaseVersionType": AffineGraphQL.Objects.ReleaseVersionType,
    "RemoveAvatar": AffineGraphQL.Objects.RemoveAvatar,
    "ReplyObjectType": AffineGraphQL.Objects.ReplyObjectType,
    "RevealedMcpCredentialType": AffineGraphQL.Objects.RevealedMcpCredentialType,
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
    "WorkspaceByokCapabilityType": AffineGraphQL.Objects.WorkspaceByokCapabilityType,
    "WorkspaceByokCatalogModelType": AffineGraphQL.Objects.WorkspaceByokCatalogModelType,
    "WorkspaceByokCatalogProviderType": AffineGraphQL.Objects.WorkspaceByokCatalogProviderType,
    "WorkspaceByokCatalogType": AffineGraphQL.Objects.WorkspaceByokCatalogType,
    "WorkspaceByokEndpointType": AffineGraphQL.Objects.WorkspaceByokEndpointType,
    "WorkspaceByokModelDeclarationType": AffineGraphQL.Objects.WorkspaceByokModelDeclarationType,
    "WorkspaceByokModelProbeCheckType": AffineGraphQL.Objects.WorkspaceByokModelProbeCheckType,
    "WorkspaceByokModelProbeType": AffineGraphQL.Objects.WorkspaceByokModelProbeType,
    "WorkspaceByokPolicyType": AffineGraphQL.Objects.WorkspaceByokPolicyType,
    "WorkspaceByokProbeResultType": AffineGraphQL.Objects.WorkspaceByokProbeResultType,
    "WorkspaceByokProbeStatusType": AffineGraphQL.Objects.WorkspaceByokProbeStatusType,
    "WorkspaceByokProfileDefinitionType": AffineGraphQL.Objects.WorkspaceByokProfileDefinitionType,
    "WorkspaceByokProfileType": AffineGraphQL.Objects.WorkspaceByokProfileType,
    "WorkspaceByokSettingsType": AffineGraphQL.Objects.WorkspaceByokSettingsType,
    "WorkspaceByokUsagePointType": AffineGraphQL.Objects.WorkspaceByokUsagePointType,
    "WorkspaceByokValidationType": AffineGraphQL.Objects.WorkspaceByokValidationType,
    "WorkspaceCalendarItemObjectType": AffineGraphQL.Objects.WorkspaceCalendarItemObjectType,
    "WorkspaceCalendarObjectType": AffineGraphQL.Objects.WorkspaceCalendarObjectType,
    "WorkspaceDocMeta": AffineGraphQL.Objects.WorkspaceDocMeta,
    "WorkspacePermissions": AffineGraphQL.Objects.WorkspacePermissions,
    "WorkspaceQuotaHumanReadableType": AffineGraphQL.Objects.WorkspaceQuotaHumanReadableType,
    "WorkspaceQuotaType": AffineGraphQL.Objects.WorkspaceQuotaType,
    "WorkspaceRolePermissions": AffineGraphQL.Objects.WorkspaceRolePermissions,
    "WorkspaceType": AffineGraphQL.Objects.WorkspaceType,
    "WorkspaceUserType": AffineGraphQL.Objects.WorkspaceUserType
  ]

  public static func objectType(forTypename typename: String) -> ApolloAPI.Object? {
    objectTypeMap[typename]
  }
}

public enum Objects {}
public enum Interfaces {}
public enum Unions {}
