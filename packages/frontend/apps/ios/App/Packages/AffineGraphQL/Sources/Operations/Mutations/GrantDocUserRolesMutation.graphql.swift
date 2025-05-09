// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GrantDocUserRolesMutation: GraphQLMutation {
  public static let operationName: String = "grantDocUserRoles"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation grantDocUserRoles($input: GrantDocUserRolesInput!) { grantDocUserRoles(input: $input) }"#
    ))

  public var input: GrantDocUserRolesInput

  public init(input: GrantDocUserRolesInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("grantDocUserRoles", Bool.self, arguments: ["input": .variable("input")]),
    ] }

    public var grantDocUserRoles: Bool { __data["grantDocUserRoles"] }
  }
}
