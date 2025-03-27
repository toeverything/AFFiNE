// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AcceptInviteByInviteIdMutation: GraphQLMutation {
  public static let operationName: String = "acceptInviteByInviteId"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation acceptInviteByInviteId($workspaceId: String!, $inviteId: String!, $sendAcceptMail: Boolean) { acceptInviteById( workspaceId: $workspaceId inviteId: $inviteId sendAcceptMail: $sendAcceptMail ) }"#
    ))

  public var workspaceId: String
  public var inviteId: String
  public var sendAcceptMail: GraphQLNullable<Bool>

  public init(
    workspaceId: String,
    inviteId: String,
    sendAcceptMail: GraphQLNullable<Bool>
  ) {
    self.workspaceId = workspaceId
    self.inviteId = inviteId
    self.sendAcceptMail = sendAcceptMail
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "inviteId": inviteId,
    "sendAcceptMail": sendAcceptMail
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    #warning("Argument 'sendAcceptMail' of field 'acceptInviteById' is deprecated. Reason: 'never used'")
    public static var __selections: [ApolloAPI.Selection] { [
      .field("acceptInviteById", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "inviteId": .variable("inviteId"),
        "sendAcceptMail": .variable("sendAcceptMail")
      ]),
    ] }

    public var acceptInviteById: Bool { __data["acceptInviteById"] }
  }
}
