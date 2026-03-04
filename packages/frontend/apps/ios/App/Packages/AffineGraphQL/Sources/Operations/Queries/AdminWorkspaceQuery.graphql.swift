// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AdminWorkspaceQuery: GraphQLQuery {
  public static let operationName: String = "adminWorkspace"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query adminWorkspace($id: String!, $memberSkip: Int, $memberTake: Int, $memberQuery: String) { adminWorkspace(id: $id) { __typename id public createdAt name avatarKey enableAi enableSharing enableUrlPreview enableDocEmbedding features owner { __typename id name email avatarUrl } memberCount publicPageCount snapshotCount snapshotSize blobCount blobSize sharedLinks { __typename docId title publishedAt } members(skip: $memberSkip, take: $memberTake, query: $memberQuery) { __typename id name email avatarUrl role status } } }"#
    ))

  public var id: String
  public var memberSkip: GraphQLNullable<Int>
  public var memberTake: GraphQLNullable<Int>
  public var memberQuery: GraphQLNullable<String>

  public init(
    id: String,
    memberSkip: GraphQLNullable<Int>,
    memberTake: GraphQLNullable<Int>,
    memberQuery: GraphQLNullable<String>
  ) {
    self.id = id
    self.memberSkip = memberSkip
    self.memberTake = memberTake
    self.memberQuery = memberQuery
  }

  public var __variables: Variables? { [
    "id": id,
    "memberSkip": memberSkip,
    "memberTake": memberTake,
    "memberQuery": memberQuery
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("adminWorkspace", AdminWorkspace?.self, arguments: ["id": .variable("id")]),
    ] }

    /// Get workspace detail for admin
    public var adminWorkspace: AdminWorkspace? { __data["adminWorkspace"] }

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
        .field("sharedLinks", [SharedLink].self),
        .field("members", [Member].self, arguments: [
          "skip": .variable("memberSkip"),
          "take": .variable("memberTake"),
          "query": .variable("memberQuery")
        ]),
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
      public var sharedLinks: [SharedLink] { __data["sharedLinks"] }
      /// Members of workspace
      public var members: [Member] { __data["members"] }

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

      /// AdminWorkspace.SharedLink
      ///
      /// Parent Type: `AdminWorkspaceSharedLink`
      public struct SharedLink: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminWorkspaceSharedLink }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("docId", String.self),
          .field("title", String?.self),
          .field("publishedAt", AffineGraphQL.DateTime?.self),
        ] }

        public var docId: String { __data["docId"] }
        public var title: String? { __data["title"] }
        public var publishedAt: AffineGraphQL.DateTime? { __data["publishedAt"] }
      }

      /// AdminWorkspace.Member
      ///
      /// Parent Type: `AdminWorkspaceMember`
      public struct Member: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.AdminWorkspaceMember }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("id", String.self),
          .field("name", String.self),
          .field("email", String.self),
          .field("avatarUrl", String?.self),
          .field("role", GraphQLEnum<AffineGraphQL.Permission>.self),
          .field("status", GraphQLEnum<AffineGraphQL.WorkspaceMemberStatus>.self),
        ] }

        public var id: String { __data["id"] }
        public var name: String { __data["name"] }
        public var email: String { __data["email"] }
        public var avatarUrl: String? { __data["avatarUrl"] }
        public var role: GraphQLEnum<AffineGraphQL.Permission> { __data["role"] }
        public var status: GraphQLEnum<AffineGraphQL.WorkspaceMemberStatus> { __data["status"] }
      }
    }
  }
}
