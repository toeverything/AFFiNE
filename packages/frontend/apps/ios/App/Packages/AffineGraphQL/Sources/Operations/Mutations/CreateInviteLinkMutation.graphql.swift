// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateInviteLinkMutation: GraphQLMutation {
  public static let operationName: String = "createInviteLink"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createInviteLink($workspaceId: String!, $expireTime: WorkspaceInviteLinkExpireTime!) { createInviteLink(workspaceId: $workspaceId, expireTime: $expireTime) { __typename link expireTime } }"#
    ))

  public var workspaceId: String
  public var expireTime: GraphQLEnum<WorkspaceInviteLinkExpireTime>

  public init(
    workspaceId: String,
    expireTime: GraphQLEnum<WorkspaceInviteLinkExpireTime>
  ) {
    self.workspaceId = workspaceId
    self.expireTime = expireTime
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "expireTime": expireTime
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createInviteLink", CreateInviteLink.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "expireTime": .variable("expireTime")
      ]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateInviteLinkMutation.Data.self
    ] }

    public var createInviteLink: CreateInviteLink { __data["createInviteLink"] }

    /// CreateInviteLink
    ///
    /// Parent Type: `InviteLink`
    public struct CreateInviteLink: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.InviteLink }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("link", String.self),
        .field("expireTime", AffineGraphQL.DateTime.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        CreateInviteLinkMutation.Data.CreateInviteLink.self
      ] }

      /// Invite link
      public var link: String { __data["link"] }
      /// Invite link expire time
      public var expireTime: AffineGraphQL.DateTime { __data["expireTime"] }
    }
  }
}
