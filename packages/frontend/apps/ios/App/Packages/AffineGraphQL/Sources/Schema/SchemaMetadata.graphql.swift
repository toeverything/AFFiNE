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
    case "ChatMessage": return AffineGraphQL.Objects.ChatMessage
    case "ContextMatchedDocChunk": return AffineGraphQL.Objects.ContextMatchedDocChunk
    case "ContextMatchedFileChunk": return AffineGraphQL.Objects.ContextMatchedFileChunk
    case "ContextWorkspaceEmbeddingStatus": return AffineGraphQL.Objects.ContextWorkspaceEmbeddingStatus
    case "Copilot": return AffineGraphQL.Objects.Copilot
    case "CopilotContext": return AffineGraphQL.Objects.CopilotContext
    case "CopilotContextCategory": return AffineGraphQL.Objects.CopilotContextCategory
    case "CopilotContextDoc": return AffineGraphQL.Objects.CopilotContextDoc
    case "CopilotContextFile": return AffineGraphQL.Objects.CopilotContextFile
    case "CopilotDocType": return AffineGraphQL.Objects.CopilotDocType
    case "CopilotHistories": return AffineGraphQL.Objects.CopilotHistories
    case "CopilotPromptConfigType": return AffineGraphQL.Objects.CopilotPromptConfigType
    case "CopilotPromptMessageType": return AffineGraphQL.Objects.CopilotPromptMessageType
    case "CopilotPromptType": return AffineGraphQL.Objects.CopilotPromptType
    case "CopilotQuota": return AffineGraphQL.Objects.CopilotQuota
    case "CopilotSessionType": return AffineGraphQL.Objects.CopilotSessionType
    case "CredentialsRequirementType": return AffineGraphQL.Objects.CredentialsRequirementType
    case "DeleteAccount": return AffineGraphQL.Objects.DeleteAccount
    case "DocHistoryType": return AffineGraphQL.Objects.DocHistoryType
    case "DocPermissions": return AffineGraphQL.Objects.DocPermissions
    case "DocType": return AffineGraphQL.Objects.DocType
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
    case "PaginatedGrantedDocUserType": return AffineGraphQL.Objects.PaginatedGrantedDocUserType
    case "PaginatedNotificationObjectType": return AffineGraphQL.Objects.PaginatedNotificationObjectType
    case "PasswordLimitsType": return AffineGraphQL.Objects.PasswordLimitsType
    case "PublicUserType": return AffineGraphQL.Objects.PublicUserType
    case "Query": return AffineGraphQL.Objects.Query
    case "ReleaseVersionType": return AffineGraphQL.Objects.ReleaseVersionType
    case "RemoveAvatar": return AffineGraphQL.Objects.RemoveAvatar
    case "ServerConfigType": return AffineGraphQL.Objects.ServerConfigType
    case "ServerRuntimeConfigType": return AffineGraphQL.Objects.ServerRuntimeConfigType
    case "ServerServiceConfig": return AffineGraphQL.Objects.ServerServiceConfig
    case "SettingsType": return AffineGraphQL.Objects.SettingsType
    case "SubscriptionPrice": return AffineGraphQL.Objects.SubscriptionPrice
    case "SubscriptionType": return AffineGraphQL.Objects.SubscriptionType
    case "TranscriptionItemType": return AffineGraphQL.Objects.TranscriptionItemType
    case "TranscriptionResultType": return AffineGraphQL.Objects.TranscriptionResultType
    case "UserImportFailedType": return AffineGraphQL.Objects.UserImportFailedType
    case "UserQuotaHumanReadableType": return AffineGraphQL.Objects.UserQuotaHumanReadableType
    case "UserQuotaType": return AffineGraphQL.Objects.UserQuotaType
    case "UserQuotaUsageType": return AffineGraphQL.Objects.UserQuotaUsageType
    case "UserType": return AffineGraphQL.Objects.UserType
    case "WorkspacePageMeta": return AffineGraphQL.Objects.WorkspacePageMeta
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
