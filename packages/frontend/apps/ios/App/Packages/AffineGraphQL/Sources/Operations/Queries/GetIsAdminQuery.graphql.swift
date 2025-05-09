// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetIsAdminQuery: GraphQLQuery {
  public static let operationName: String = "getIsAdmin"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getIsAdmin($workspaceId: String!) { isAdmin(workspaceId: $workspaceId) }"#
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
    ] }

    /// Get is admin of workspace
    @available(*, deprecated, message: "use WorkspaceType[role] instead")
    public var isAdmin: Bool { __data["isAdmin"] }
  }
}
