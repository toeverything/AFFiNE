// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ListBlobsQuery: GraphQLQuery {
  public static let operationName: String = "listBlobs"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query listBlobs($workspaceId: String!) { workspace(id: $workspaceId) { __typename blobs { __typename key size mime createdAt } } }"#
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
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ListBlobsQuery.Data.self
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
        .field("blobs", [Blob].self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        ListBlobsQuery.Data.Workspace.self
      ] }

      /// List blobs of workspace
      public var blobs: [Blob] { __data["blobs"] }

      /// Workspace.Blob
      ///
      /// Parent Type: `ListedBlob`
      public struct Blob: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.ListedBlob }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("key", String.self),
          .field("size", Int.self),
          .field("mime", String.self),
          .field("createdAt", String.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          ListBlobsQuery.Data.Workspace.Blob.self
        ] }

        public var key: String { __data["key"] }
        public var size: Int { __data["size"] }
        public var mime: String { __data["mime"] }
        public var createdAt: String { __data["createdAt"] }
      }
    }
  }
}
