// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UploadAvatarMutation: GraphQLMutation {
  public static let operationName: String = "uploadAvatar"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation uploadAvatar($avatar: Upload!) { uploadAvatar(avatar: $avatar) { __typename id name avatarUrl email } }"#
    ))

  public var avatar: Upload

  public init(avatar: Upload) {
    self.avatar = avatar
  }

  public var __variables: Variables? { ["avatar": avatar] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("uploadAvatar", UploadAvatar.self, arguments: ["avatar": .variable("avatar")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      UploadAvatarMutation.Data.self
    ] }

    /// Upload user avatar
    public var uploadAvatar: UploadAvatar { __data["uploadAvatar"] }

    /// UploadAvatar
    ///
    /// Parent Type: `UserType`
    public struct UploadAvatar: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("name", String.self),
        .field("avatarUrl", String?.self),
        .field("email", String.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        UploadAvatarMutation.Data.UploadAvatar.self
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      /// User name
      public var name: String { __data["name"] }
      /// User avatar url
      public var avatarUrl: String? { __data["avatarUrl"] }
      /// User email
      public var email: String { __data["email"] }
    }
  }
}
