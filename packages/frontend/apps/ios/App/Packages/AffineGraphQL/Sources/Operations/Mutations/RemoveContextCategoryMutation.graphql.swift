// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RemoveContextCategoryMutation: GraphQLMutation {
  public static let operationName: String = "removeContextCategory"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation removeContextCategory($options: RemoveContextCategoryInput!) { removeContextCategory(options: $options) }"#
    ))

  public var options: RemoveContextCategoryInput

  public init(options: RemoveContextCategoryInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("removeContextCategory", Bool.self, arguments: ["options": .variable("options")]),
    ] }

    /// remove a category from context
    public var removeContextCategory: Bool { __data["removeContextCategory"] }
  }
}
