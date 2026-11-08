// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class McpCredentialsQuery: GraphQLQuery {
  public static let operationName: String = "mcpCredentials"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query mcpCredentials($workspaceId: String!) { mcpCredentialReadWriteAvailable mcpCredentials(workspaceId: $workspaceId) { __typename id name workspaceId accessMode fingerprint createdAt expiresAt lastUsedAt revokedAt graceEndsAt status } }"#
    ))

  public var workspaceId: String

  public init(workspaceId: String) {
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { ["workspaceId": workspaceId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("mcpCredentialReadWriteAvailable", Bool.self),
      .field("mcpCredentials", [McpCredential].self, arguments: ["workspaceId": .variable("workspaceId")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      McpCredentialsQuery.Data.self
    ] }

    public var mcpCredentialReadWriteAvailable: Bool { __data["mcpCredentialReadWriteAvailable"] }
    public var mcpCredentials: [McpCredential] { __data["mcpCredentials"] }

    /// McpCredential
    ///
    /// Parent Type: `McpCredentialType`
    public struct McpCredential: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.McpCredentialType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("name", String.self),
        .field("workspaceId", String.self),
        .field("accessMode", GraphQLEnum<AffineGraphQL.McpAccessMode>.self),
        .field("fingerprint", String.self),
        .field("createdAt", AffineGraphQL.DateTime.self),
        .field("expiresAt", AffineGraphQL.DateTime.self),
        .field("lastUsedAt", AffineGraphQL.DateTime?.self),
        .field("revokedAt", AffineGraphQL.DateTime?.self),
        .field("graceEndsAt", AffineGraphQL.DateTime?.self),
        .field("status", GraphQLEnum<AffineGraphQL.McpCredentialStatus>.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        McpCredentialsQuery.Data.McpCredential.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      public var name: String { __data["name"] }
      public var workspaceId: String { __data["workspaceId"] }
      public var accessMode: GraphQLEnum<AffineGraphQL.McpAccessMode> { __data["accessMode"] }
      public var fingerprint: String { __data["fingerprint"] }
      public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
      public var expiresAt: AffineGraphQL.DateTime { __data["expiresAt"] }
      public var lastUsedAt: AffineGraphQL.DateTime? { __data["lastUsedAt"] }
      public var revokedAt: AffineGraphQL.DateTime? { __data["revokedAt"] }
      public var graceEndsAt: AffineGraphQL.DateTime? { __data["graceEndsAt"] }
      public var status: GraphQLEnum<AffineGraphQL.McpCredentialStatus> { __data["status"] }
    }
  }
}
