// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RevokePublicPageMutation: GraphQLMutation {
  public static let operationName: String = "revokePublicPage"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation revokePublicPage($workspaceId: String!, $pageId: String!) { revokePublicDoc(workspaceId: $workspaceId, docId: $pageId) { __typename id mode public } }"#
    ))

  public var workspaceId: String
  public var pageId: String

  public init(
    workspaceId: String,
    pageId: String
  ) {
    self.workspaceId = workspaceId
    self.pageId = pageId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "pageId": pageId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("revokePublicDoc", RevokePublicDoc.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "docId": .variable("pageId")
      ]),
    ] }

    public var revokePublicDoc: RevokePublicDoc { __data["revokePublicDoc"] }

    /// RevokePublicDoc
    ///
    /// Parent Type: `DocType`
    public struct RevokePublicDoc: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.DocType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", String.self),
        .field("mode", GraphQLEnum<AffineGraphQL.PublicDocMode>.self),
        .field("public", Bool.self),
      ] }

      public var id: String { __data["id"] }
      public var mode: GraphQLEnum<AffineGraphQL.PublicDocMode> { __data["mode"] }
      public var `public`: Bool { __data["public"] }
    }
  }
}
