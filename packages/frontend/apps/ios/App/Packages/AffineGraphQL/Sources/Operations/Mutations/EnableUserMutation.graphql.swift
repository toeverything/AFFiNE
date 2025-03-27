// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class EnableUserMutation: GraphQLMutation {
  public static let operationName: String = "enableUser"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation enableUser($id: String!) { enableUser(id: $id) { __typename email disabled } }"#
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
      .field("enableUser", EnableUser.self, arguments: ["id": .variable("id")]),
    ] }

    /// Reenable an banned user
    public var enableUser: EnableUser { __data["enableUser"] }

    /// EnableUser
    ///
    /// Parent Type: `UserType`
    public struct EnableUser: AffineGraphQL.SelectionSet {
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
