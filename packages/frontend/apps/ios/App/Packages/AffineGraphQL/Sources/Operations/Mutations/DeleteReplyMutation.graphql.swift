// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class DeleteReplyMutation: GraphQLMutation {
  public static let operationName: String = "deleteReply"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation deleteReply($id: String!) { deleteReply(id: $id) }"#
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
      .field("deleteReply", Bool.self, arguments: ["id": .variable("id")]),
    ] }

    /// Delete a reply
    public var deleteReply: Bool { __data["deleteReply"] }
  }
}
