// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ApproveWorkspaceTeamMemberMutation: GraphQLMutation {
  public static let operationName: String = "approveWorkspaceTeamMember"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation approveWorkspaceTeamMember($workspaceId: String!, $userId: String!) { approveMember(workspaceId: $workspaceId, userId: $userId) }"#
    ))

  public var workspaceId: String
  public var userId: String

  public init(
    workspaceId: String,
    userId: String
  ) {
    self.workspaceId = workspaceId
    self.userId = userId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "userId": userId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("approveMember", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "userId": .variable("userId")
      ]),
    ] }

    public var approveMember: Bool { __data["approveMember"] }
  }
}
