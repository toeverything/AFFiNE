// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetIsOwnerQuery: GraphQLQuery {
  public static let operationName: String = "getIsOwner"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getIsOwner($workspaceId: String!) { isOwner(workspaceId: $workspaceId) }"#
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
      .field("isOwner", Bool.self, arguments: ["workspaceId": .variable("workspaceId")]),
    ] }

    /// Get is owner of workspace
    @available(*, deprecated, message: "use WorkspaceType[role] instead")
    public var isOwner: Bool { __data["isOwner"] }
  }
}
