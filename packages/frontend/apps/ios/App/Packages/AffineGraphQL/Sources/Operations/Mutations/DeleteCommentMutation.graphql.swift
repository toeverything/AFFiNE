// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeleteCommentMutation: GraphQLMutation {
  public static let operationName: String = "deleteComment"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deleteComment($id: String!) { deleteComment(id: $id) }"#
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
      .field("deleteComment", Bool.self, arguments: ["id": .variable("id")]),
    ] }

    /// Delete a comment
    public var deleteComment: Bool { __data["deleteComment"] }
  }
}
