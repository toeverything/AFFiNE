// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ResolveCommentMutation: GraphQLMutation {
  public static let operationName: String = "resolveComment"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation resolveComment($input: CommentResolveInput!) { resolveComment(input: $input) }"#
    ))

  public var input: CommentResolveInput

  public init(input: CommentResolveInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("resolveComment", Bool.self, arguments: ["input": .variable("input")]),
    ] }

    /// Resolve a comment or not
    public var resolveComment: Bool { __data["resolveComment"] }
  }
}
