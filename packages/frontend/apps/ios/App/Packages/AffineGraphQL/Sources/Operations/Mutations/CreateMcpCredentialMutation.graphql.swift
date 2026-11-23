// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateMcpCredentialMutation: GraphQLMutation {
  public static let operationName: String = "createMcpCredential"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createMcpCredential($input: CreateMcpCredentialInput!) { createMcpCredential(input: $input) { __typename credential { __typename id name workspaceId accessMode fingerprint createdAt expiresAt lastUsedAt revokedAt graceEndsAt status } token } }"#
    ))

  public var input: CreateMcpCredentialInput

  public init(input: CreateMcpCredentialInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createMcpCredential", CreateMcpCredential.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateMcpCredentialMutation.Data.self
    ] }

    public var createMcpCredential: CreateMcpCredential { __data["createMcpCredential"] }

    /// CreateMcpCredential
    ///
    /// Parent Type: `RevealedMcpCredentialType`
    public struct CreateMcpCredential: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.RevealedMcpCredentialType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("credential", Credential.self),
        .field("token", String.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        CreateMcpCredentialMutation.Data.CreateMcpCredential.self
      ] }

      public var credential: Credential { __data["credential"] }
      public var token: String { __data["token"] }

      /// CreateMcpCredential.Credential
      ///
      /// Parent Type: `McpCredentialType`
      public struct Credential: AffineGraphQL.SelectionSet {
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
          CreateMcpCredentialMutation.Data.CreateMcpCredential.Credential.self
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
}
