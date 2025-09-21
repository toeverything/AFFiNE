// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateCommentMutation: GraphQLMutation {
  public static let operationName: String = "updateComment"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateComment($input: CommentUpdateInput!) { updateComment(input: $input) }"#
    ))

  public var input: CommentUpdateInput

  public init(input: CommentUpdateInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateComment", Bool.self, arguments: ["input": .variable("input")]),
    ] }

    /// Update a comment content
    public var updateComment: Bool { __data["updateComment"] }
  }
}
