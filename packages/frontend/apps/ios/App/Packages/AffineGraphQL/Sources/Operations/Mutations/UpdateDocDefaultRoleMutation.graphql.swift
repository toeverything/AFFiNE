// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateDocDefaultRoleMutation: GraphQLMutation {
  public static let operationName: String = "updateDocDefaultRole"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateDocDefaultRole($input: UpdateDocDefaultRoleInput!) { updateDocDefaultRole(input: $input) }"#
    ))

  public var input: UpdateDocDefaultRoleInput

  public init(input: UpdateDocDefaultRoleInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateDocDefaultRole", Bool.self, arguments: ["input": .variable("input")]),
    ] }

    public var updateDocDefaultRole: Bool { __data["updateDocDefaultRole"] }
  }
}
