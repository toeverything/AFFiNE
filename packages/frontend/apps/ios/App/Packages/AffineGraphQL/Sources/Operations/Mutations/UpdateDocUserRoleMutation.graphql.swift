// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateDocUserRoleMutation: GraphQLMutation {
  public static let operationName: String = "updateDocUserRole"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateDocUserRole($input: UpdateDocUserRoleInput!) { updateDocUserRole(input: $input) }"#
    ))

  public var input: UpdateDocUserRoleInput

  public init(input: UpdateDocUserRoleInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateDocUserRole", Bool.self, arguments: ["input": .variable("input")]),
    ] }

    public var updateDocUserRole: Bool { __data["updateDocUserRole"] }
  }
}
