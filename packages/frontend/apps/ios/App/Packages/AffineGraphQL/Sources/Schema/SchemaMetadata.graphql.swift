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

  public static func objectType(forTypename typename: String) -> ApolloAPI.Object? {
    switch typename {
    case "AggregateBucketHitsObjectType": return AffineGraphQL.Objects.AggregateBucketHitsObjectType
    case "AggregateBucketObjectType": return AffineGraphQL.Objects.AggregateBucketObjectType
    case "AggregateResultObjectType": return AffineGraphQL.Objects.AggregateResultObjectType
    case "AppConfigValidateResult": return AffineGraphQL.Objects.AppConfigValidateResult
    case "BlobUploadInit": return AffineGraphQL.Objects.BlobUploadInit
    case "BlobUploadPart": return AffineGraphQL.Objects.BlobUploadPart
    case "BlobUploadedPart": return AffineGraphQL.Objects.BlobUploadedPart
    case "ChatMessage": return AffineGraphQL.Objects.ChatMessage
    case "CommentChangeObjectType": return AffineGraphQL.Objects.CommentChangeObjectType
    case "CommentChangeObjectTypeEdge": return AffineGraphQL.Objects.CommentChangeObjectTypeEdge
    case "CommentObjectType": return AffineGraphQL.Objects.CommentObjectType
    case "CommentObjectTypeEdge": return AffineGraphQL.Objects.CommentObjectTypeEdge
    case "ContextMatchedDocChunk": return AffineGraphQL.Objects.ContextMatchedDocChunk
    case "ContextMatchedFileChunk": return AffineGraphQL.Objects.ContextMatchedFileChunk
    case "ContextWorkspaceEmbeddingStatus": return AffineGraphQL.Objects.ContextWorkspaceEmbeddingStatus
    case "Copilot": return AffineGraphQL.Objects.Copilot
    case "CopilotContext": return AffineGraphQL.Objects.CopilotContext
    case "CopilotContextBlob": return AffineGraphQL.Objects.CopilotContextBlob
    case "CopilotContextCategory": return AffineGraphQL.Objects.CopilotContextCategory
    case "CopilotContextDoc": return AffineGraphQL.Objects.CopilotContextDoc
    case "CopilotContextFile": return AffineGraphQL.Objects.CopilotContextFile
    case "CopilotHistories": return AffineGraphQL.Objects.CopilotHistories
    case "CopilotHistoriesTypeEdge": return AffineGraphQL.Objects.CopilotHistoriesTypeEdge
    case "CopilotModelType": return AffineGraphQL.Objects.CopilotModelType
    case "CopilotModelsType": return AffineGraphQL.Objects.CopilotModelsType
    case "CopilotPromptConfigType": return AffineGraphQL.Objects.CopilotPromptConfigType
    case "CopilotPromptMessageType": return AffineGraphQL.Objects.CopilotPromptMessageType
    case "CopilotPromptType": return AffineGraphQL.Objects.CopilotPromptType
    case "CopilotQuota": return AffineGraphQL.Objects.CopilotQuota
    case "CopilotWorkspaceConfig": return AffineGraphQL.Objects.CopilotWorkspaceConfig
    case "CopilotWorkspaceFile": return AffineGraphQL.Objects.CopilotWorkspaceFile
    case "CopilotWorkspaceFileTypeEdge": return AffineGraphQL.Objects.CopilotWorkspaceFileTypeEdge
    case "CopilotWorkspaceIgnoredDoc": return AffineGraphQL.Objects.CopilotWorkspaceIgnoredDoc
    case "CopilotWorkspaceIgnoredDocTypeEdge": return AffineGraphQL.Objects.CopilotWorkspaceIgnoredDocTypeEdge
    case "CredentialsRequirementType": return AffineGraphQL.Objects.CredentialsRequirementType
    case "DeleteAccount": return AffineGraphQL.Objects.DeleteAccount
    case "DocHistoryType": return AffineGraphQL.Objects.DocHistoryType
    case "DocPermissions": return AffineGraphQL.Objects.DocPermissions
    case "DocType": return AffineGraphQL.Objects.DocType
    case "DocTypeEdge": return AffineGraphQL.Objects.DocTypeEdge
    case "EditorType": return AffineGraphQL.Objects.EditorType
    case "GrantedDocUserType": return AffineGraphQL.Objects.GrantedDocUserType
    case "GrantedDocUserTypeEdge": return AffineGraphQL.Objects.GrantedDocUserTypeEdge
    case "InvitationType": return AffineGraphQL.Objects.InvitationType
    case "InvitationWorkspaceType": return AffineGraphQL.Objects.InvitationWorkspaceType
    case "InviteLink": return AffineGraphQL.Objects.InviteLink
    case "InviteResult": return AffineGraphQL.Objects.InviteResult
    case "InviteUserType": return AffineGraphQL.Objects.InviteUserType
    case "InvoiceType": return AffineGraphQL.Objects.InvoiceType
    case "License": return AffineGraphQL.Objects.License
    case "LimitedUserType": return AffineGraphQL.Objects.LimitedUserType
    case "ListedBlob": return AffineGraphQL.Objects.ListedBlob
    case "Mutation": return AffineGraphQL.Objects.Mutation
    case "NotificationObjectType": return AffineGraphQL.Objects.NotificationObjectType
    case "NotificationObjectTypeEdge": return AffineGraphQL.Objects.NotificationObjectTypeEdge
    case "PageInfo": return AffineGraphQL.Objects.PageInfo
    case "PaginatedCommentChangeObjectType": return AffineGraphQL.Objects.PaginatedCommentChangeObjectType
    case "PaginatedCommentObjectType": return AffineGraphQL.Objects.PaginatedCommentObjectType
    case "PaginatedCopilotHistoriesType": return AffineGraphQL.Objects.PaginatedCopilotHistoriesType
    case "PaginatedCopilotWorkspaceFileType": return AffineGraphQL.Objects.PaginatedCopilotWorkspaceFileType
    case "PaginatedDocType": return AffineGraphQL.Objects.PaginatedDocType
    case "PaginatedGrantedDocUserType": return AffineGraphQL.Objects.PaginatedGrantedDocUserType
    case "PaginatedIgnoredDocsType": return AffineGraphQL.Objects.PaginatedIgnoredDocsType
    case "PaginatedNotificationObjectType": return AffineGraphQL.Objects.PaginatedNotificationObjectType
    case "PasswordLimitsType": return AffineGraphQL.Objects.PasswordLimitsType
    case "PublicUserType": return AffineGraphQL.Objects.PublicUserType
    case "Query": return AffineGraphQL.Objects.Query
    case "ReleaseVersionType": return AffineGraphQL.Objects.ReleaseVersionType
    case "RemoveAvatar": return AffineGraphQL.Objects.RemoveAvatar
    case "ReplyObjectType": return AffineGraphQL.Objects.ReplyObjectType
    case "RevealedAccessToken": return AffineGraphQL.Objects.RevealedAccessToken
    case "SearchDocObjectType": return AffineGraphQL.Objects.SearchDocObjectType
    case "SearchNodeObjectType": return AffineGraphQL.Objects.SearchNodeObjectType
    case "SearchResultObjectType": return AffineGraphQL.Objects.SearchResultObjectType
    case "SearchResultPagination": return AffineGraphQL.Objects.SearchResultPagination
    case "ServerConfigType": return AffineGraphQL.Objects.ServerConfigType
    case "StreamObject": return AffineGraphQL.Objects.StreamObject
    case "SubscriptionPrice": return AffineGraphQL.Objects.SubscriptionPrice
    case "SubscriptionType": return AffineGraphQL.Objects.SubscriptionType
    case "TranscriptionItemType": return AffineGraphQL.Objects.TranscriptionItemType
    case "TranscriptionResultType": return AffineGraphQL.Objects.TranscriptionResultType
    case "UserImportFailedType": return AffineGraphQL.Objects.UserImportFailedType
    case "UserQuotaHumanReadableType": return AffineGraphQL.Objects.UserQuotaHumanReadableType
    case "UserQuotaType": return AffineGraphQL.Objects.UserQuotaType
    case "UserQuotaUsageType": return AffineGraphQL.Objects.UserQuotaUsageType
    case "UserSettingsType": return AffineGraphQL.Objects.UserSettingsType
    case "UserType": return AffineGraphQL.Objects.UserType
    case "WorkspaceDocMeta": return AffineGraphQL.Objects.WorkspaceDocMeta
    case "WorkspacePermissions": return AffineGraphQL.Objects.WorkspacePermissions
    case "WorkspaceQuotaHumanReadableType": return AffineGraphQL.Objects.WorkspaceQuotaHumanReadableType
    case "WorkspaceQuotaType": return AffineGraphQL.Objects.WorkspaceQuotaType
    case "WorkspaceRolePermissions": return AffineGraphQL.Objects.WorkspaceRolePermissions
    case "WorkspaceType": return AffineGraphQL.Objects.WorkspaceType
    case "WorkspaceUserType": return AffineGraphQL.Objects.WorkspaceUserType
    case "tokenType": return AffineGraphQL.Objects.TokenType
    default: return nil
    }
  }
}

public enum Objects {}
public enum Interfaces {}
public enum Unions {}
