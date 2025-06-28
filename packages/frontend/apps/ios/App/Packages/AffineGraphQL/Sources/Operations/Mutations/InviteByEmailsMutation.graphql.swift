// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class InviteByEmailsMutation: GraphQLMutation {
  public static let operationName: String = "inviteByEmails"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation inviteByEmails($workspaceId: String!, $emails: [String!]!) { inviteMembers(workspaceId: $workspaceId, emails: $emails) { __typename email inviteId sentSuccess } }"#
    ))

  public var workspaceId: String
  public var emails: [String]

  public init(
    workspaceId: String,
    emails: [String]
  ) {
    self.workspaceId = workspaceId
    self.emails = emails
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "emails": emails
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("inviteMembers", [InviteMember].self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "emails": .variable("emails")
      ]),
    ] }

    public var inviteMembers: [InviteMember] { __data["inviteMembers"] }

    /// InviteMember
    ///
    /// Parent Type: `InviteResult`
    public struct InviteMember: AffineGraphQL.SelectionSet {
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
      @available(*, deprecated, message: "Notification will be sent asynchronously")
      public var sentSuccess: Bool { __data["sentSuccess"] }
    }
  }
}
