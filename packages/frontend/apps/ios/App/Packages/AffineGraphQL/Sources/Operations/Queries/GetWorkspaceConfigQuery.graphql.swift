// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspaceConfigQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspaceConfig"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspaceConfig($id: String!) { workspace(id: $id) { __typename enableAi enableUrlPreview enableDocEmbedding inviteLink { __typename link expireTime } } }"#
    ))

  public var id: String

  public init(id: String) {
    self.id = id
  }

  public var __variables: Variables? { ["id": id] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("id")]),
    ] }

    /// Get workspace by id
    public var workspace: Workspace { __data["workspace"] }

    /// Workspace
    ///
    /// Parent Type: `WorkspaceType`
    public struct Workspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("enableAi", Bool.self),
        .field("enableUrlPreview", Bool.self),
        .field("enableDocEmbedding", Bool.self),
        .field("inviteLink", InviteLink?.self),
      ] }

      /// Enable AI
      public var enableAi: Bool { __data["enableAi"] }
      /// Enable url previous when sharing
      public var enableUrlPreview: Bool { __data["enableUrlPreview"] }
      /// Enable doc embedding
      public var enableDocEmbedding: Bool { __data["enableDocEmbedding"] }
      /// invite link for workspace
      public var inviteLink: InviteLink? { __data["inviteLink"] }

      /// Workspace.InviteLink
      ///
      /// Parent Type: `InviteLink`
      public struct InviteLink: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.InviteLink }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("link", String.self),
          .field("expireTime", AffineGraphQL.DateTime.self),
        ] }

        /// Invite link
        public var link: String { __data["link"] }
        /// Invite link expire time
        public var expireTime: AffineGraphQL.DateTime { __data["expireTime"] }
      }
    }
  }
}
