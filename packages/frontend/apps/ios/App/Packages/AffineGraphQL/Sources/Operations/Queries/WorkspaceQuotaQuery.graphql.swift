// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class WorkspaceQuotaQuery: GraphQLQuery {
  public static let operationName: String = "workspaceQuota"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query workspaceQuota($id: String!) { workspace(id: $id) { __typename quota { __typename name blobLimit storageQuota usedStorageQuota historyPeriod memberLimit memberCount humanReadable { __typename name blobLimit storageQuota historyPeriod memberLimit } } } }"#
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
        .field("quota", Quota.self),
      ] }

      /// quota of workspace
      public var quota: Quota { __data["quota"] }

      /// Workspace.Quota
      ///
      /// Parent Type: `WorkspaceQuotaType`
      public struct Quota: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceQuotaType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("name", String.self),
          .field("blobLimit", AffineGraphQL.SafeInt.self),
          .field("storageQuota", AffineGraphQL.SafeInt.self),
          .field("usedStorageQuota", AffineGraphQL.SafeInt.self),
          .field("historyPeriod", AffineGraphQL.SafeInt.self),
          .field("memberLimit", Int.self),
          .field("memberCount", Int.self),
          .field("humanReadable", HumanReadable.self),
        ] }

        public var name: String { __data["name"] }
        public var blobLimit: AffineGraphQL.SafeInt { __data["blobLimit"] }
        public var storageQuota: AffineGraphQL.SafeInt { __data["storageQuota"] }
        public var usedStorageQuota: AffineGraphQL.SafeInt { __data["usedStorageQuota"] }
        public var historyPeriod: AffineGraphQL.SafeInt { __data["historyPeriod"] }
        public var memberLimit: Int { __data["memberLimit"] }
        public var memberCount: Int { __data["memberCount"] }
        public var humanReadable: HumanReadable { __data["humanReadable"] }

        /// Workspace.Quota.HumanReadable
        ///
        /// Parent Type: `WorkspaceQuotaHumanReadableType`
        public struct HumanReadable: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceQuotaHumanReadableType }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("name", String.self),
            .field("blobLimit", String.self),
            .field("storageQuota", String.self),
            .field("historyPeriod", String.self),
            .field("memberLimit", String.self),
          ] }

          public var name: String { __data["name"] }
          public var blobLimit: String { __data["blobLimit"] }
          public var storageQuota: String { __data["storageQuota"] }
          public var historyPeriod: String { __data["historyPeriod"] }
          public var memberLimit: String { __data["memberLimit"] }
        }
      }
    }
  }
}
