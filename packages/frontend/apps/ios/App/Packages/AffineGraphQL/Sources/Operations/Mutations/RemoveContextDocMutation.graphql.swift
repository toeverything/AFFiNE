// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RemoveContextDocMutation: GraphQLMutation {
  public static let operationName: String = "removeContextDoc"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation removeContextDoc($options: RemoveContextDocInput!) { removeContextDoc(options: $options) }"#
    ))

  public var options: RemoveContextDocInput

  public init(options: RemoveContextDocInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("removeContextDoc", Bool.self, arguments: ["options": .variable("options")]),
    ] }

    /// remove a doc from context
    public var removeContextDoc: Bool { __data["removeContextDoc"] }
  }
}
