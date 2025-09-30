// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetDocSummaryQuery: GraphQLQuery {
  public static let operationName: String = "getDocSummary"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getDocSummary($workspaceId: String!, $docId: String!) { workspace(id: $workspaceId) { __typename doc(docId: $docId) { __typename summary } } }"#
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
          .field("summary", String?.self),
        ] }

        public var summary: String? { __data["summary"] }
      }
    }
  }
}
