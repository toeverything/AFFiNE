// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AdminWorkspacesQuery: GraphQLQuery {
  public static let operationName: String = "adminWorkspaces"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query adminWorkspaces($filter: ListWorkspaceInput!) { adminWorkspaces(filter: $filter) { __typename id public createdAt name avatarKey enableAi enableSharing enableUrlPreview enableDocEmbedding features owner { __typename id name email avatarUrl } memberCount publicPageCount snapshotCount snapshotSize blobCount blobSize } }"#
    ))

  public var filter: ListWorkspaceInput

  public init(filter: ListWorkspaceInput) {
    self.filter = filter
  }

  public var __variables: Variables? { ["filter": filter] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("adminWorkspaces", [AdminWorkspace].self, arguments: ["filter": .variable("filter")]),
    ] }

    /// List workspaces for admin
    public var adminWorkspaces: [AdminWorkspace] { __data["adminWorkspaces"] }

    /// AdminWorkspace
    ///
    /// Parent Type: `AdminWorkspace`
    public struct AdminWorkspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminWorkspace }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String.self),
        .field("public", Bool.self),
        .field("createdAt", AffineGraphQL.DateTime.self),
        .field("name", String?.self),
        .field("avatarKey", String?.self),
        .field("enableAi", Bool.self),
        .field("enableSharing", Bool.self),
        .field("enableUrlPreview", Bool.self),
        .field("enableDocEmbedding", Bool.self),
        .field("features", [GraphQLEnum<AffineGraphQL.FeatureType>].self),
        .field("owner", Owner?.self),
        .field("memberCount", Int.self),
        .field("publicPageCount", Int.self),
        .field("snapshotCount", Int.self),
        .field("snapshotSize", AffineGraphQL.SafeInt.self),
        .field("blobCount", Int.self),
        .field("blobSize", AffineGraphQL.SafeInt.self),
      ] }

      public var id: String { __data["id"] }
      public var `public`: Bool { __data["public"] }
      public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
      public var name: String? { __data["name"] }
      public var avatarKey: String? { __data["avatarKey"] }
      public var enableAi: Bool { __data["enableAi"] }
      public var enableSharing: Bool { __data["enableSharing"] }
      public var enableUrlPreview: Bool { __data["enableUrlPreview"] }
      public var enableDocEmbedding: Bool { __data["enableDocEmbedding"] }
      public var features: [GraphQLEnum<AffineGraphQL.FeatureType>] { __data["features"] }
      public var owner: Owner? { __data["owner"] }
      public var memberCount: Int { __data["memberCount"] }
      public var publicPageCount: Int { __data["publicPageCount"] }
      public var snapshotCount: Int { __data["snapshotCount"] }
      public var snapshotSize: AffineGraphQL.SafeInt { __data["snapshotSize"] }
      public var blobCount: Int { __data["blobCount"] }
      public var blobSize: AffineGraphQL.SafeInt { __data["blobSize"] }

      /// AdminWorkspace.Owner
      ///
      /// Parent Type: `WorkspaceUserType`
      public struct Owner: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceUserType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("id", String.self),
          .field("name", String.self),
          .field("email", String.self),
          .field("avatarUrl", String?.self),
        ] }

        public var id: String { __data["id"] }
        public var name: String { __data["name"] }
        public var email: String { __data["email"] }
        public var avatarUrl: String? { __data["avatarUrl"] }
      }
    }
  }
}
