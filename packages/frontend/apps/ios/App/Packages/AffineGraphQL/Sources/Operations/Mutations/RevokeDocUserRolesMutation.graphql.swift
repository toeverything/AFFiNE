// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RevokeDocUserRolesMutation: GraphQLMutation {
  public static let operationName: String = "revokeDocUserRoles"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation revokeDocUserRoles($input: RevokeDocUserRoleInput!) { revokeDocUserRoles(input: $input) }"#
    ))

  public var input: RevokeDocUserRoleInput

  public init(input: RevokeDocUserRoleInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("revokeDocUserRoles", Bool.self, arguments: ["input": .variable("input")]),
    ] }

    public var revokeDocUserRoles: Bool { __data["revokeDocUserRoles"] }
  }
}
