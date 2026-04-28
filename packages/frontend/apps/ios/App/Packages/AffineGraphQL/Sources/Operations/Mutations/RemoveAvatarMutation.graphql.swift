// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RemoveAvatarMutation: GraphQLMutation {
  public static let operationName: String = "removeAvatar"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation removeAvatar { removeAvatar { __typename success } }"#
    ))

  public init() {}

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("removeAvatar", RemoveAvatar.self),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      RemoveAvatarMutation.Data.self
    ] }

    /// Remove user avatar
    public var removeAvatar: RemoveAvatar { __data["removeAvatar"] }

    /// RemoveAvatar
    ///
    /// Parent Type: `RemoveAvatar`
    public struct RemoveAvatar: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.RemoveAvatar }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("success", Bool.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        RemoveAvatarMutation.Data.RemoveAvatar.self
      ] }

      public var success: Bool { __data["success"] }
    }
  }
}
