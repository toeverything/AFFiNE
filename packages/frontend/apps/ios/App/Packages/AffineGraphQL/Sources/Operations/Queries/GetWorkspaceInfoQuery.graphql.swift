// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspaceInfoQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspaceInfo"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspaceInfo($workspaceId: String!) { isAdmin(workspaceId: $workspaceId) isOwner(workspaceId: $workspaceId) workspace(id: $workspaceId) { __typename team } }"#
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
      .field("isAdmin", Bool.self, arguments: ["workspaceId": .variable("workspaceId")]),
      .field("isOwner", Bool.self, arguments: ["workspaceId": .variable("workspaceId")]),
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }

    /// Get is admin of workspace
    @available(*, deprecated, message: "use WorkspaceType[role] instead")
    public var isAdmin: Bool { __data["isAdmin"] }
    /// Get is owner of workspace
    @available(*, deprecated, message: "use WorkspaceType[role] instead")
    public var isOwner: Bool { __data["isOwner"] }
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
        .field("team", Bool.self),
      ] }

      /// if workspace is team workspace
      public var team: Bool { __data["team"] }
    }
  }
}
