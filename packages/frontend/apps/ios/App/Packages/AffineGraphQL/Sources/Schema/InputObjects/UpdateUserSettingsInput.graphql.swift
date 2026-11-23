// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpdateUserSettingsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    receiveCommentEmail: GraphQLNullable<Bool> = nil,
    receiveInvitationEmail: GraphQLNullable<Bool> = nil,
    receiveMentionEmail: GraphQLNullable<Bool> = nil
  ) {
    __data = InputDict([
      "receiveCommentEmail": receiveCommentEmail,
      "receiveInvitationEmail": receiveInvitationEmail,
      "receiveMentionEmail": receiveMentionEmail
    ])
  }

  /// Receive comment email
  public var receiveCommentEmail: GraphQLNullable<Bool> {
    get { __data["receiveCommentEmail"] }
    set { __data["receiveCommentEmail"] = newValue }
  }

  /// Receive invitation email
  public var receiveInvitationEmail: GraphQLNullable<Bool> {
    get { __data["receiveInvitationEmail"] }
    set { __data["receiveInvitationEmail"] = newValue }
  }

  /// Receive mention email
  public var receiveMentionEmail: GraphQLNullable<Bool> {
    get { __data["receiveMentionEmail"] }
    set { __data["receiveMentionEmail"] = newValue }
  }
}
