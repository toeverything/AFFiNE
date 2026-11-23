// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeleteWorkspaceByokProfileMutation: GraphQLMutation {
  public static let operationName: String = "deleteWorkspaceByokProfile"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deleteWorkspaceByokProfile($workspaceId: String!, $profileId: ID!) { deleteWorkspaceByokProfile(workspaceId: $workspaceId, profileId: $profileId) }"#
    ))

  public var workspaceId: String
  public var profileId: ID

  public init(
    workspaceId: String,
    profileId: ID
  ) {
    self.workspaceId = workspaceId
    self.profileId = profileId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "profileId": profileId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("deleteWorkspaceByokProfile", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "profileId": .variable("profileId")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      DeleteWorkspaceByokProfileMutation.Data.self
    ] }

    public var deleteWorkspaceByokProfile: Bool { __data["deleteWorkspaceByokProfile"] }
  }
}
