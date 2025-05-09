// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class InviteByEmailMutation: GraphQLMutation {
  public static let operationName: String = "inviteByEmail"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation inviteByEmail($workspaceId: String!, $email: String!, $sendInviteMail: Boolean) { invite( workspaceId: $workspaceId email: $email sendInviteMail: $sendInviteMail ) }"#
    ))

  public var workspaceId: String
  public var email: String
  public var sendInviteMail: GraphQLNullable<Bool>

  public init(
    workspaceId: String,
    email: String,
    sendInviteMail: GraphQLNullable<Bool>
  ) {
    self.workspaceId = workspaceId
    self.email = email
    self.sendInviteMail = sendInviteMail
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "email": email,
    "sendInviteMail": sendInviteMail
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    #warning("Argument 'sendInviteMail' of field 'invite' is deprecated. Reason: 'never used'")
    public static var __selections: [ApolloAPI.Selection] { [
      .field("invite", String.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "email": .variable("email"),
        "sendInviteMail": .variable("sendInviteMail")
      ]),
    ] }

    public var invite: String { __data["invite"] }
  }
}
