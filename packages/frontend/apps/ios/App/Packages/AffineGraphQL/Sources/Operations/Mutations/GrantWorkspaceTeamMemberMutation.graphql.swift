// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GrantWorkspaceTeamMemberMutation: GraphQLMutation {
  public static let operationName: String = "grantWorkspaceTeamMember"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation grantWorkspaceTeamMember($workspaceId: String!, $userId: String!, $permission: Permission!) { grantMember(workspaceId: $workspaceId, userId: $userId, permission: $permission) }"#
    ))

  public var workspaceId: String
  public var userId: String
  public var permission: GraphQLEnum<Permission>

  public init(
    workspaceId: String,
    userId: String,
    permission: GraphQLEnum<Permission>
  ) {
    self.workspaceId = workspaceId
    self.userId = userId
    self.permission = permission
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "userId": userId,
    "permission": permission
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("grantMember", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "userId": .variable("userId"),
        "permission": .variable("permission")
      ]),
    ] }

    public var grantMember: Bool { __data["grantMember"] }
  }
}
