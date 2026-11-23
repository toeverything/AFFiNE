// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetMemberCountByWorkspaceIdQuery: GraphQLQuery {
  public static let operationName: String = "getMemberCountByWorkspaceId"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getMemberCountByWorkspaceId($workspaceId: String!) { workspace(id: $workspaceId) { __typename memberCount } }"#
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
      GetMemberCountByWorkspaceIdQuery.Data.self
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
        .field("memberCount", Int.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        GetMemberCountByWorkspaceIdQuery.Data.Workspace.self
      ] }

      /// member count of workspace
      public var memberCount: Int { __data["memberCount"] }
    }
  }
}
