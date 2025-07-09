// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateReplyMutation: GraphQLMutation {
  public static let operationName: String = "updateReply"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateReply($input: ReplyUpdateInput!) { updateReply(input: $input) }"#
    ))

  public var input: ReplyUpdateInput

  public init(input: ReplyUpdateInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateReply", Bool.self, arguments: ["input": .variable("input")]),
    ] }

    /// Update a reply content
    public var updateReply: Bool { __data["updateReply"] }
  }
}
