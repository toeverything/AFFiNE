// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetDocRolePermissionsQuery: GraphQLQuery {
  public static let operationName: String = "getDocRolePermissions"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getDocRolePermissions($workspaceId: String!, $docId: String!) { workspace(id: $workspaceId) { __typename doc(docId: $docId) { __typename permissions { __typename Doc_Copy Doc_Delete Doc_Duplicate Doc_Properties_Read Doc_Properties_Update Doc_Publish Doc_Read Doc_Restore Doc_TransferOwner Doc_Trash Doc_Update Doc_Users_Manage Doc_Users_Read Doc_Comments_Create Doc_Comments_Delete Doc_Comments_Read Doc_Comments_Resolve } } } }"#
    ))

  public var workspaceId: String
  public var docId: String

  public init(
    workspaceId: String,
    docId: String
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
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
        .field("doc", Doc.self, arguments: ["docId": .variable("docId")]),
      ] }

      /// Get get with given id
      public var doc: Doc { __data["doc"] }

      /// Workspace.Doc
      ///
      /// Parent Type: `DocType`
      public struct Doc: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("permissions", Permissions.self),
        ] }

        public var permissions: Permissions { __data["permissions"] }

        /// Workspace.Doc.Permissions
        ///
        /// Parent Type: `DocPermissions`
        public struct Permissions: AffineGraphQL.SelectionSet {
          public let __data: DataDict
          public init(_dataDict: DataDict) { __data = _dataDict }

          public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocPermissions }
          public static var __selections: [ApolloAPI.Selection] { [
            .field("__typename", String.self),
            .field("Doc_Copy", Bool.self),
            .field("Doc_Delete", Bool.self),
            .field("Doc_Duplicate", Bool.self),
            .field("Doc_Properties_Read", Bool.self),
            .field("Doc_Properties_Update", Bool.self),
            .field("Doc_Publish", Bool.self),
            .field("Doc_Read", Bool.self),
            .field("Doc_Restore", Bool.self),
            .field("Doc_TransferOwner", Bool.self),
            .field("Doc_Trash", Bool.self),
            .field("Doc_Update", Bool.self),
            .field("Doc_Users_Manage", Bool.self),
            .field("Doc_Users_Read", Bool.self),
            .field("Doc_Comments_Create", Bool.self),
            .field("Doc_Comments_Delete", Bool.self),
            .field("Doc_Comments_Read", Bool.self),
            .field("Doc_Comments_Resolve", Bool.self),
          ] }

          public var doc_Copy: Bool { __data["Doc_Copy"] }
          public var doc_Delete: Bool { __data["Doc_Delete"] }
          public var doc_Duplicate: Bool { __data["Doc_Duplicate"] }
          public var doc_Properties_Read: Bool { __data["Doc_Properties_Read"] }
          public var doc_Properties_Update: Bool { __data["Doc_Properties_Update"] }
          public var doc_Publish: Bool { __data["Doc_Publish"] }
          public var doc_Read: Bool { __data["Doc_Read"] }
          public var doc_Restore: Bool { __data["Doc_Restore"] }
          public var doc_TransferOwner: Bool { __data["Doc_TransferOwner"] }
          public var doc_Trash: Bool { __data["Doc_Trash"] }
          public var doc_Update: Bool { __data["Doc_Update"] }
          public var doc_Users_Manage: Bool { __data["Doc_Users_Manage"] }
          public var doc_Users_Read: Bool { __data["Doc_Users_Read"] }
          public var doc_Comments_Create: Bool { __data["Doc_Comments_Create"] }
          public var doc_Comments_Delete: Bool { __data["Doc_Comments_Delete"] }
          public var doc_Comments_Read: Bool { __data["Doc_Comments_Read"] }
          public var doc_Comments_Resolve: Bool { __data["Doc_Comments_Resolve"] }
        }
      }
    }
  }
}
