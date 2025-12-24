// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class RemoveContextBlobMutation: GraphQLMutation {
  public static let operationName: String = "removeContextBlob"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation removeContextBlob($options: RemoveContextBlobInput!) { removeContextBlob(options: $options) }"#
    ))

  public var options: RemoveContextBlobInput

  public init(options: RemoveContextBlobInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("removeContextBlob", Bool.self, arguments: ["options": .variable("options")]),
    ] }

    /// remove a blob from context
    public var removeContextBlob: Bool { __data["removeContextBlob"] }
  }
}
