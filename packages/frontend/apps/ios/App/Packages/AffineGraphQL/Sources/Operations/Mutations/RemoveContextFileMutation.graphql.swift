// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RemoveContextFileMutation: GraphQLMutation {
  public static let operationName: String = "removeContextFile"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation removeContextFile($options: RemoveContextFileInput!) { removeContextFile(options: $options) }"#
    ))

  public var options: RemoveContextFileInput

  public init(options: RemoveContextFileInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("removeContextFile", Bool.self, arguments: ["options": .variable("options")]),
    ] }

    /// remove a file from context
    public var removeContextFile: Bool { __data["removeContextFile"] }
  }
}
