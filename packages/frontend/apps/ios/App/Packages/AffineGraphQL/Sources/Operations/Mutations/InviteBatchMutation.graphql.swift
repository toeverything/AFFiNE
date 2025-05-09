// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class InviteBatchMutation: GraphQLMutation {
  public static let operationName: String = "inviteBatch"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation inviteBatch($workspaceId: String!, $emails: [String!]!, $sendInviteMail: Boolean) { inviteBatch( workspaceId: $workspaceId emails: $emails sendInviteMail: $sendInviteMail ) { __typename email inviteId sentSuccess } }"#
    ))

  public var workspaceId: String
  public var emails: [String]
  public var sendInviteMail: GraphQLNullable<Bool>

  public init(
    workspaceId: String,
    emails: [String],
    sendInviteMail: GraphQLNullable<Bool>
  ) {
    self.workspaceId = workspaceId
    self.emails = emails
    self.sendInviteMail = sendInviteMail
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "emails": emails,
    "sendInviteMail": sendInviteMail
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    #warning("Argument 'sendInviteMail' of field 'inviteBatch' is deprecated. Reason: 'never used'")
    public static var __selections: [ApolloAPI.Selection] { [
      .field("inviteBatch", [InviteBatch].self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "emails": .variable("emails"),
        "sendInviteMail": .variable("sendInviteMail")
      ]),
    ] }

    public var inviteBatch: [InviteBatch] { __data["inviteBatch"] }

    /// InviteBatch
    ///
    /// Parent Type: `InviteResult`
    public struct InviteBatch: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.InviteResult }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("email", String.self),
        .field("inviteId", String?.self),
        .field("sentSuccess", Bool.self),
      ] }

      public var email: String { __data["email"] }
      /// Invite id, null if invite record create failed
      public var inviteId: String? { __data["inviteId"] }
      /// Invite email sent success
      public var sentSuccess: Bool { __data["sentSuccess"] }
    }
  }
}
