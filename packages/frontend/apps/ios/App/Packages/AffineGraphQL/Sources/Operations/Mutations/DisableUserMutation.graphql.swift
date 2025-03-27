// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DisableUserMutation: GraphQLMutation {
  public static let operationName: String = "disableUser"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation disableUser($id: String!) { banUser(id: $id) { __typename email disabled } }"#
    ))

  public var id: String

  public init(id: String) {
    self.id = id
  }

  public var __variables: Variables? { ["id": id] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("banUser", BanUser.self, arguments: ["id": .variable("id")]),
    ] }

    /// Ban an user
    public var banUser: BanUser { __data["banUser"] }

    /// BanUser
    ///
    /// Parent Type: `UserType`
    public struct BanUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("email", String.self),
        .field("disabled", Bool.self),
      ] }

      /// User email
      public var email: String { __data["email"] }
      /// User is disabled
      public var disabled: Bool { __data["disabled"] }
    }
  }
}
