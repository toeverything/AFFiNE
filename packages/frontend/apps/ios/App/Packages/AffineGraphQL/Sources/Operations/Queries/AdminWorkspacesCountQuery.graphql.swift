// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AdminWorkspacesCountQuery: GraphQLQuery {
  public static let operationName: String = "adminWorkspacesCount"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query adminWorkspacesCount($filter: ListWorkspaceInput!) { adminWorkspacesCount(filter: $filter) }"#
    ))

  public var filter: ListWorkspaceInput

  public init(filter: ListWorkspaceInput) {
    self.filter = filter
  }

  public var __variables: Variables? { ["filter": filter] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("adminWorkspacesCount", Int.self, arguments: ["filter": .variable("filter")]),
    ] }

    /// Workspaces count for admin
    public var adminWorkspacesCount: Int { __data["adminWorkspacesCount"] }
  }
}
